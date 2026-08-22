import {
  LATENCY_WINDOW_MILLIS,
  PROFILE_DEFAULT_WINDOW_HOURS,
  SLOW_MULTIPLIER,
} from '@/types/constants';
import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import { ProfileCacheState } from '@/types/enums';
import type { ProfileOverview, RuleLatencyDetail } from '@/types/profile';

const ms = (nanos: number | null): string => (nanos == null ? '–' : (nanos / 1e6).toFixed(2));
const msWithUnit = (nanos: number | null): string =>
  nanos == null ? '–' : `${(nanos / 1e6).toFixed(2)}ms`;

export function registerProfileCommands(program: Command): void {
  program
    .command('profile <groupId>')
    .description('Per-rule latency profile with relative slow-rule flags')
    .option(
      '--rule <ruleId>',
      `Single-rule detail (distributions + ${LATENCY_WINDOW_MILLIS / 1000}s window series)`,
    )
    .option('--version <versionId>', 'Version to inspect (default: live version)')
    .option(
      '--from <instant>',
      `Window start, ISO-8601 instant (default: ${PROFILE_DEFAULT_WINDOW_HOURS}h ago)`,
    )
    .option('--to <instant>', 'Window end, ISO-8601 instant (default: now)')
    .option('--cache <state>', 'Cache dimension for the rule table: HIT | MISS (default: HIT)')
    .addHelpText(
      'after',
      dedent`

        Slow-rule judgment is relative only: flagged = p50 ≥ ${SLOW_MULTIPLIER}× the median of
        per-rule p50s within the group. Absolute ms thresholds are intentionally
        not supported. Each percentile is withheld (–) unless n×(1−q) ≥ 3 —
        p50 from n ≥ 6, p95 from n ≥ 60, p99 from n ≥ 300. TOTAL is recorded
        on every call, rule detail from a deterministic 1% sample.

        Examples:
          $ lexq profile <groupId>
          $ lexq profile <groupId> --cache MISS --from 2026-07-01T00:00:00Z
          $ lexq profile <groupId> --rule <ruleId> --version <versionId>
      `,
    )
    .action(async (groupId, opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        if (opts.cache && !ProfileCacheState.includes(opts.cache)) {
          throw new Error(`--cache must be one of: ${ProfileCacheState.join(' | ')}`);
        }

        const params: Record<string, string> = {};
        if (opts.version) params.versionId = opts.version;
        if (opts.from) params.from = opts.from;
        if (opts.to) params.to = opts.to;
        if (opts.cache) params.cacheState = opts.cache;

        const clientOpts = {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        };

        if (opts.rule) {
          const data = await apiRequest<RuleLatencyDetail>(
            'GET',
            `policy-groups/${groupId}/profile/rules/${opts.rule}`,
            { ...clientOpts, params },
          );
          // Rule detail is nested (distributions + window series) — a flat table
          // would misrepresent the structure, so output is JSON regardless of --format.
          if (format === 'table') {
            console.error('note: --rule detail is nested; printing JSON (table not supported)');
          }
          printJson(data);
          return;
        }

        const data = await apiRequest<ProfileOverview>('GET', `policy-groups/${groupId}/profile`, {
          ...clientOpts,
          params,
        });

        if (format !== 'table') {
          printJson(data);
          return;
        }

        console.log(`window   : ${data.from} ~ ${data.to}  (cache: ${data.ruleCacheState})`);
        console.log(`version  : ${data.policyVersionId ?? '– (no live version)'}`);
        for (const s of data.summary) {
          const t = s.total;
          console.log(
            `TOTAL ${s.cacheState.padEnd(4)}: n=${t.n}  p50=${msWithUnit(t.p50Nanos)}  p95=${msWithUnit(t.p95Nanos)}  p99=${msWithUnit(t.p99Nanos)}`,
          );
        }
        for (const b of data.baselines) {
          const base =
            b.status === 'OK'
              ? `${msWithUnit(b.baselineP50Nanos)} (cohort ${b.cohortSize})`
              : `– (${b.status}, cohort ${b.cohortSize})`;
          console.log(`baseline ${b.phase.padEnd(9)}: ${base}`);
        }
        if (data.droppedRows > 0) {
          console.log(`⚠ droppedRows=${data.droppedRows} (corrupt histogram rows skipped)`);
        }

        printTable(
          ['Rule', 'Phase', 'n', 'p50(ms)', 'p95(ms)', 'p99(ms)', '×base', 'Flagged'],
          data.rules.flatMap((rule) =>
            rule.phases.map((p) => [
              rule.ruleId.substring(0, 12),
              p.phase,
              String(p.stats.n),
              ms(p.stats.p50Nanos),
              ms(p.stats.p95Nanos),
              ms(p.stats.p99Nanos),
              p.baselineMultiple == null ? '–' : `${p.baselineMultiple.toFixed(1)}×`,
              p.flagged ? 'YES' : '',
            ]),
          ),
          { truncate: 24 },
        );
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });
}

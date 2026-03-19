import { createCli } from './cli.js';
import { printError } from './lib/output.js';

async function main(): Promise<void> {
    const program = createCli();

    try {
        await program.parseAsync(process.argv);
    } catch (error) {
        printError(error);
        process.exit(1);
    }
}

main();
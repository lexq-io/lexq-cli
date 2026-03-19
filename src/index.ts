import { createCli } from './cli';
import { printError } from './lib/output';

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
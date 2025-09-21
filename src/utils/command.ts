import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

interface DockerCommandOptions {
    trimOutput?: boolean;
    maxBuffer?: number;
}

export async function runDockerCommand(
    args: string[],
    options: DockerCommandOptions = {}
): Promise<string> {
    const { trimOutput = true, maxBuffer = DEFAULT_MAX_BUFFER } = options;
    const { stdout } = await execFileAsync('docker', args, { maxBuffer });
    return trimOutput ? stdout.trim() : stdout;
}

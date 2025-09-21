import {
    ContainerAction,
    ContainerDetail,
    DockerContainer,
    DockerImage,
    DockerVolume,
    ImageAction,
    ImageDetail,
    TextPayload,
    VolumeAction,
    VolumeDetail
} from '../types';
import { runDockerCommand } from '../utils/command';

const NO_DATA = '';
const DEFAULT_LOG_LINES = 300;
const LOG_LINES_STEP = 300;

export interface DetailTextOptions {
    logsEmpty: string;
    statsEmpty: string;
    imageHistoryEmpty: string;
    volumeInspectEmpty: string;
}

export class DockerService {
    getDefaultLogLines(): number {
        return DEFAULT_LOG_LINES;
    }

    getLogLinesStep(): number {
        return LOG_LINES_STEP;
    }

    async listContainers(): Promise<DockerContainer[]> {
        const format = '{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}\t{{.State}}';
        const output = await runDockerCommand(['ps', '-a', '--format', format]);
        if (!output) {
            return [];
        }

        return output
            .split(/\r?\n/)
            .map((line) => line.split('\t'))
            .filter((parts): parts is [string, string, string, string, string] => parts.length === 5)
            .map(([id, image, status, rawName, state]) => ({
                id,
                image,
                status,
                name: rawName.split(',')[0]?.trim() ?? '',
                state: state.trim()
            }));
    }

    async listImages(): Promise<DockerImage[]> {
        const output = await runDockerCommand(['images', '--format', '{{json .}}']);
        if (!output) {
            return [];
        }

        const images: DockerImage[] = [];
        for (const line of output.split(/\r?\n/)) {
            if (!line.trim()) {
                continue;
            }

            try {
                const parsed = JSON.parse(line) as Record<string, string | undefined>;
                const id = parsed.Digest && parsed.Digest !== '<none>' ? parsed.Digest : parsed.ID ?? '';
                if (!id) {
                    continue;
                }
                images.push({
                    id,
                    repository: parsed.Repository ?? '<none>',
                    tag: parsed.Tag ?? '<none>',
                    digest: parsed.Digest && parsed.Digest !== '<none>' ? parsed.Digest : undefined,
                    size: parsed.Size ?? '',
                    createdSince: parsed.CreatedSince,
                    createdAt: parsed.CreatedAt
                });
            } catch (error) {
                console.error('Failed to parse docker image line', error);
            }
        }

        return images;
    }

    async listVolumes(): Promise<DockerVolume[]> {
        const output = await runDockerCommand(['volume', 'ls', '--format', '{{json .}}']);
        if (!output) {
            return [];
        }

        const volumes: DockerVolume[] = [];
        for (const line of output.split(/\r?\n/)) {
            if (!line.trim()) {
                continue;
            }

            try {
                const parsed = JSON.parse(line) as Record<string, string | undefined>;
                const name = parsed.Name ?? '';
                if (!name) {
                    continue;
                }
                volumes.push({
                    name,
                    driver: parsed.Driver ?? '',
                    mountpoint: parsed.Mountpoint ?? '',
                    scope: parsed.Scope,
                    createdAt: parsed.CreatedAt,
                    labels: parsed.Labels
                });
            } catch (error) {
                console.error('Failed to parse docker volume line', error);
            }
        }

        return volumes;
    }

    async runContainerAction(action: ContainerAction, containerId: string): Promise<void> {
        switch (action) {
            case 'start':
                await runDockerCommand(['start', containerId]);
                break;
            case 'restart':
                await runDockerCommand(['restart', containerId]);
                break;
            case 'stop':
                await runDockerCommand(['stop', containerId]);
                break;
            case 'remove':
                await runDockerCommand(['rm', '-f', containerId]);
                break;
            default:
                break;
        }
    }

    async runImageAction(action: ImageAction, imageId: string): Promise<void> {
        switch (action) {
            case 'remove':
                await runDockerCommand(['image', 'rm', imageId]);
                break;
            default:
                break;
        }
    }

    async runVolumeAction(action: VolumeAction, volumeName: string): Promise<void> {
        switch (action) {
            case 'remove':
                await runDockerCommand(['volume', 'rm', volumeName]);
                break;
            default:
                break;
        }
    }

    async getContainerLogs(containerId: string, fallback: string, lines = DEFAULT_LOG_LINES): Promise<TextPayload> {
        try {
            const stdout = await runDockerCommand(['logs', '--tail', String(lines), containerId], {
                trimOutput: false
            });
            return { content: stdout || fallback };
        } catch (error) {
            return this.toErrorPayload(error);
        }
    }

    async getContainerInspect(containerId: string): Promise<TextPayload> {
        try {
            const raw = await runDockerCommand(['inspect', containerId]);
            const parsed = JSON.parse(raw);
            return { content: JSON.stringify(parsed, null, 2) };
        } catch (error) {
            return this.toErrorPayload(error);
        }
    }

    async getContainerStats(containerId: string, fallback: string): Promise<TextPayload> {
        try {
            const raw = await runDockerCommand(['stats', '--no-stream', '--format', '{{json .}}', containerId]);
            if (!raw) {
                return { content: fallback || NO_DATA };
            }

            const [firstLine] = raw.split(/\r?\n/).filter(Boolean);
            if (!firstLine) {
                return { content: fallback || NO_DATA };
            }

            const parsed = JSON.parse(firstLine);
            return { content: JSON.stringify(parsed, null, 2) };
        } catch (error) {
            return this.toErrorPayload(error);
        }
    }

    async getImageInspect(imageId: string): Promise<TextPayload> {
        try {
            const raw = await runDockerCommand(['image', 'inspect', imageId]);
            const parsed = JSON.parse(raw);
            return { content: JSON.stringify(parsed, null, 2) };
        } catch (error) {
            return this.toErrorPayload(error);
        }
    }

    async getImageHistory(imageId: string, fallback: string): Promise<TextPayload> {
        try {
            const stdout = await runDockerCommand(['image', 'history', '--no-trunc', imageId], { trimOutput: false });
            return { content: stdout || fallback };
        } catch (error) {
            return this.toErrorPayload(error);
        }
    }

    async getVolumeInspect(volumeName: string, fallback: string): Promise<TextPayload> {
        try {
            const raw = await runDockerCommand(['volume', 'inspect', volumeName]);
            const parsed = JSON.parse(raw);
            return { content: JSON.stringify(parsed, null, 2) };
        } catch (error) {
            return fallback ? { content: fallback } : this.toErrorPayload(error);
        }
    }

    async buildContainerDetail(
        container: DockerContainer,
        textOptions: DetailTextOptions,
        logLines: number = DEFAULT_LOG_LINES
    ): Promise<ContainerDetail> {
        const [logs, inspect, stats] = await Promise.all([
            this.getContainerLogs(container.id, textOptions.logsEmpty, logLines),
            this.getContainerInspect(container.id),
            this.getContainerStats(container.id, textOptions.statsEmpty)
        ]);

        return { logs, inspect, stats, logsLines: logLines };
    }

    async buildImageDetail(image: DockerImage, textOptions: DetailTextOptions): Promise<ImageDetail> {
        const [inspect, history] = await Promise.all([
            this.getImageInspect(image.id),
            this.getImageHistory(image.id, textOptions.imageHistoryEmpty)
        ]);

        return { inspect, history };
    }

    async buildVolumeDetail(volume: DockerVolume, textOptions: DetailTextOptions): Promise<VolumeDetail> {
        const inspect = await this.getVolumeInspect(volume.name, textOptions.volumeInspectEmpty);
        return { inspect };
    }

    async loadMoreContainerLogs(
        container: DockerContainer,
        textOptions: DetailTextOptions,
        targetLines: number
    ): Promise<{ logs: TextPayload; logsLines: number }> {
        const logs = await this.getContainerLogs(container.id, textOptions.logsEmpty, targetLines);
        return { logs, logsLines: targetLines };
    }

    private toErrorPayload(error: unknown): TextPayload {
        const message = error instanceof Error ? error.message : String(error);
        return { content: '', error: message };
    }
}

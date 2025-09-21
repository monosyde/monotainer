export interface DockerContainer {
    id: string;
    image: string;
    status: string;
    name: string;
    state: string;
}

export interface DockerImage {
    id: string;
    repository: string;
    tag: string;
    digest?: string;
    size: string;
    createdSince?: string;
    createdAt?: string;
}

export interface DockerVolume {
    name: string;
    driver: string;
    mountpoint: string;
    scope?: string;
    createdAt?: string;
    labels?: string;
}

export type ContainerAction = 'start' | 'restart' | 'stop' | 'remove';
export type ImageAction = 'remove';
export type VolumeAction = 'remove';

export type TextPayload = { content: string; error?: string };

export interface ContainerDetail {
    logs: TextPayload;
    inspect: TextPayload;
    stats: TextPayload;
    logsLines: number;
}

export interface ImageDetail {
    inspect: TextPayload;
    history: TextPayload;
}

export interface VolumeDetail {
    inspect: TextPayload;
}

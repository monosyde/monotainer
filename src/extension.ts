import * as vscode from 'vscode';
import {
    ContainerAction,
    DockerContainer,
    DockerImage,
    DockerVolume,
    ImageAction,
    VolumeAction
} from './types';
import { DockerService, DetailTextOptions } from './services/dockerService';
import {
    Locale,
    formatContainerDisplayName,
    formatImageDisplayName,
    formatVolumeDisplayName,
    getAllMessages,
    localize,
    resolveLocale
} from './localization';

const dockerService = new DockerService();
let dashboardPanel: vscode.WebviewPanel | undefined;
let activeLocale: Locale = 'en';
let detailTextOptions: DetailTextOptions = createDetailTextOptions(activeLocale);

function createDetailTextOptions(locale: Locale): DetailTextOptions {
    return {
        logsEmpty: localize(locale, 'detail.logs.empty'),
        statsEmpty: localize(locale, 'detail.stats.empty'),
        imageHistoryEmpty: localize(locale, 'detail.image.historyEmpty'),
        volumeInspectEmpty: localize(locale, 'detail.volume.inspectEmpty')
    };
}

async function loadWebviewHtml(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    locale: Locale
): Promise<string> {
    const htmlUri = vscode.Uri.joinPath(context.extensionUri, 'media', 'dashboard.html');
    const bytes = await vscode.workspace.fs.readFile(htmlUri);
    const template = Buffer.from(bytes).toString('utf8');
    const nonce = Math.random().toString(36).slice(2, 12);
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'styles.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'dashboard.js'));
    const translations = getAllMessages();
    const i18nPayload = JSON.stringify(translations).replace(/</g, '\\u003c');
    const supportedLocales = JSON.stringify(Object.keys(translations)).replace(/</g, '\\u003c');
    const cspSource = webview.cspSource;

    return template
        .replace(/{{nonce}}/g, nonce)
        .replace(/{{styleUri}}/g, styleUri.toString())
        .replace(/{{scriptUri}}/g, scriptUri.toString())
        .replace(/{{i18nPayload}}/g, i18nPayload)
        .replace(/{{supportedLocales}}/g, supportedLocales)
        .replace(/{{cspSource}}/g, cspSource)
        .replace(/{{lang}}/g, locale);
}

async function showActiveContainersQuickPick(): Promise<void> {
    try {
        const containers = await dockerService.listContainers();
        const running = containers.filter((container) => container.state === 'running');

        if (running.length === 0) {
            void vscode.window.showInformationMessage(localize(activeLocale, 'quickPick.noActiveContainers'));
            return;
        }

        const items = running.map((container) => ({
            label: formatContainerDisplayName(container),
            description: container.image,
            detail: `${container.id} — ${container.status}`
        }));

        await vscode.window.showQuickPick(items, {
            placeHolder: localize(activeLocale, 'quickPick.placeholder'),
            matchOnDescription: true,
            matchOnDetail: true
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(localize(activeLocale, 'error.listContainers', { error: message }));
    }
}

async function refreshDashboard(panel: vscode.WebviewPanel): Promise<void> {
    try {
        const [containers, images, volumes] = await Promise.all([
            dockerService.listContainers(),
            dockerService.listImages(),
            dockerService.listVolumes()
        ]);

        await panel.webview.postMessage({
            type: 'state',
            containers,
            images,
            volumes,
            generatedAt: new Date().toLocaleString()
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage({
            type: 'error',
            message: localize(activeLocale, 'status.refresh.error', { error: message })
        });
        void vscode.window.showErrorMessage(localize(activeLocale, 'status.refresh.error', { error: message }));
    }
}

async function handleContainerAction(
    panel: vscode.WebviewPanel,
    action: ContainerAction,
    container: DockerContainer
): Promise<void> {
    const displayName = formatContainerDisplayName(container);
    const statusKey = `status.action.container.${action}` as const;
    const successKey = `status.action.container.success.${action}` as const;

    await panel.webview.postMessage({
        type: 'status',
        text: localize(activeLocale, statusKey, { name: displayName }),
        isLoading: true
    });

    try {
        await dockerService.runContainerAction(action, container.id);
        await refreshDashboard(panel);
        await panel.webview.postMessage({
            type: 'actionResult',
            text: localize(activeLocale, successKey, { name: displayName })
        });
        void vscode.window.showInformationMessage(localize(activeLocale, successKey, { name: displayName }));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorText = localize(activeLocale, 'status.action.container.error', {
            name: displayName,
            error: message
        });
        await panel.webview.postMessage({ type: 'actionResult', text: errorText });
        void vscode.window.showErrorMessage(errorText);
    }
}

async function handleImageAction(
    panel: vscode.WebviewPanel,
    action: ImageAction,
    image: DockerImage
): Promise<void> {
    const displayName = formatImageDisplayName(image);
    const statusKey = `status.action.image.${action}` as const;
    const successKey = `status.action.image.success.${action}` as const;
    const errorKey = `status.action.image.error` as const;

    await panel.webview.postMessage({
        type: 'status',
        text: localize(activeLocale, statusKey, { name: displayName }),
        isLoading: true
    });

    try {
        await dockerService.runImageAction(action, image.id);
        await refreshDashboard(panel);
        await panel.webview.postMessage({
            type: 'actionResult',
            text: localize(activeLocale, successKey, { name: displayName })
        });
        void vscode.window.showInformationMessage(localize(activeLocale, successKey, { name: displayName }));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorText = localize(activeLocale, errorKey, { name: displayName, error: message });
        await panel.webview.postMessage({ type: 'actionResult', text: errorText });
        void vscode.window.showErrorMessage(errorText);
    }
}

async function handleVolumeAction(
    panel: vscode.WebviewPanel,
    action: VolumeAction,
    volume: DockerVolume
): Promise<void> {
    const displayName = formatVolumeDisplayName(volume);
    const statusKey = `status.action.volume.${action}` as const;
    const successKey = `status.action.volume.success.${action}` as const;
    const errorKey = `status.action.volume.error` as const;

    await panel.webview.postMessage({
        type: 'status',
        text: localize(activeLocale, statusKey, { name: displayName }),
        isLoading: true
    });

    try {
        await dockerService.runVolumeAction(action, volume.name);
        await refreshDashboard(panel);
        await panel.webview.postMessage({
            type: 'actionResult',
            text: localize(activeLocale, successKey, { name: displayName })
        });
        void vscode.window.showInformationMessage(localize(activeLocale, successKey, { name: displayName }));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorText = localize(activeLocale, errorKey, { name: displayName, error: message });
        await panel.webview.postMessage({ type: 'actionResult', text: errorText });
        void vscode.window.showErrorMessage(errorText);
    }
}

async function openExecTerminal(container: DockerContainer): Promise<void> {
    const displayName = formatContainerDisplayName(container);
    const terminal = vscode.window.createTerminal({
        name: localize(activeLocale, 'terminal.execTitle', { name: displayName }),
        shellPath: 'docker',
        shellArgs: ['exec', '-it', container.id, '/bin/sh']
    });
    terminal.show();
}

async function openDashboard(context: vscode.ExtensionContext): Promise<void> {
    if (dashboardPanel) {
        dashboardPanel.reveal(vscode.ViewColumn.One);
        await refreshDashboard(dashboardPanel);
        return;
    }

    dashboardPanel = vscode.window.createWebviewPanel(
        'dockerDashboard',
        localize(activeLocale, 'dashboard.title'),
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
    );

    dashboardPanel.webview.html = await loadWebviewHtml(context, dashboardPanel.webview, activeLocale);

    const subscription = dashboardPanel.webview.onDidReceiveMessage(async (message) => {
        switch (message?.type) {
            case 'refresh':
                await refreshDashboard(dashboardPanel!);
                break;
            case 'exec':
                await openExecTerminal(message.container);
                break;
            case 'containerAction':
                await handleContainerAction(dashboardPanel!, message.action, message.container);
                break;
            case 'imageAction':
                await handleImageAction(dashboardPanel!, message.action, message.image);
                break;
            case 'volumeAction':
                await handleVolumeAction(dashboardPanel!, message.action, message.volume);
                break;
            case 'select': {
                await dashboardPanel!.webview.postMessage({
                    type: 'status',
                    text: localize(activeLocale, 'status.detail.loading'),
                    isLoading: true
                });

                const fetchedAt = new Date().toLocaleString();

                if (message.resource === 'container') {
                    const detail = await dockerService.buildContainerDetail(message.container, detailTextOptions);
                    await dashboardPanel!.webview.postMessage({
                        type: 'detail',
                        resource: 'container',
                        container: message.container,
                        detail,
                        fetchedAt,
                        logLines: detail.logsLines,
                        logStep: dockerService.getLogLinesStep()
                    });
                } else if (message.resource === 'image') {
                    const detail = await dockerService.buildImageDetail(message.image, detailTextOptions);
                    await dashboardPanel!.webview.postMessage({
                        type: 'detail',
                        resource: 'image',
                        image: message.image,
                        detail,
                        fetchedAt
                    });
                } else if (message.resource === 'volume') {
                    const detail = await dockerService.buildVolumeDetail(message.volume, detailTextOptions);
                    await dashboardPanel!.webview.postMessage({
                        type: 'detail',
                        resource: 'volume',
                        volume: message.volume,
                        detail,
                        fetchedAt
                    });
                }

                await dashboardPanel!.webview.postMessage({ type: 'status', text: '', isLoading: false });
                break;
            }
            case 'loadMoreLogs': {
                const container = message.container as DockerContainer;
                const targetLines =
                    typeof message.target === 'number'
                        ? message.target
                        : (typeof message.lines === 'number' ? message.lines : dockerService.getDefaultLogLines()) +
                          dockerService.getLogLinesStep();
                const result = await dockerService.loadMoreContainerLogs(container, detailTextOptions, targetLines);
                await dashboardPanel!.webview.postMessage({
                    type: 'logsMore',
                    containerId: container.id,
                    logs: result.logs,
                    logLines: result.logsLines,
                    logStep: dockerService.getLogLinesStep()
                });
                await dashboardPanel!.webview.postMessage({ type: 'status', text: '', isLoading: false });
                break;
            }
            case 'changeLocale': {
                const newLocale = resolveLocale(message.locale);
                if (newLocale !== activeLocale) {
                    activeLocale = newLocale;
                    detailTextOptions = createDetailTextOptions(activeLocale);
                    if (dashboardPanel) {
                        dashboardPanel.title = localize(activeLocale, 'dashboard.title');
                        dashboardPanel.webview.html = await loadWebviewHtml(context, dashboardPanel.webview, activeLocale);
                    }
                } else if (dashboardPanel) {
                    await refreshDashboard(dashboardPanel);
                }
                break;
            }
            default:
                break;
        }
    });

    dashboardPanel.onDidDispose(
        () => {
            dashboardPanel = undefined;
            subscription.dispose();
        },
        null,
        context.subscriptions
    );

    await refreshDashboard(dashboardPanel);
}

export function activate(context: vscode.ExtensionContext): void {
    activeLocale = resolveLocale(vscode.env.language);
    detailTextOptions = createDetailTextOptions(activeLocale);

    const listCommand = vscode.commands.registerCommand('monotainer.listContainers', async () => {
        await showActiveContainersQuickPick();
    });

    const dashboardCommand = vscode.commands.registerCommand('monotainer.openContainerDashboard', async () => {
        await openDashboard(context);
    });

    context.subscriptions.push(listCommand, dashboardCommand);
}

export function deactivate(): void {
    if (dashboardPanel) {
        dashboardPanel.dispose();
    }
}

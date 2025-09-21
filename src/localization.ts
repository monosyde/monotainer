import { enMessages } from './locales/en';
import { ruMessages } from './locales/ru';
import type { MessageDictionary } from './locales/types';
import type { DockerContainer, DockerImage, DockerVolume } from './types';

export type Locale = 'en' | 'ru';
export type MessageKey = keyof typeof enMessages;

const locales: Record<Locale, MessageDictionary> = {
  en: enMessages,
  ru: ruMessages
};

const DEFAULT_LOCALE: Locale = 'en';

export function resolveLocale(language: string | undefined): Locale {
  if (!language) {
    return DEFAULT_LOCALE;
  }
  return language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template
  );
}

export function localize(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const dictionary = locales[locale] ?? locales[DEFAULT_LOCALE];
  const template = dictionary[key] ?? locales[DEFAULT_LOCALE][key];
  return format(template, params);
}

export function getAllMessages(): Record<Locale, MessageDictionary> {
  return {
    en: { ...locales.en },
    ru: { ...locales.ru }
  };
}

export function formatContainerDisplayName(container: DockerContainer): string {
  return container.name || container.id;
}

export function formatImageDisplayName(image: DockerImage): string {
  return `${image.repository}:${image.tag}`;
}

export function formatVolumeDisplayName(volume: DockerVolume): string {
  return volume.name;
}

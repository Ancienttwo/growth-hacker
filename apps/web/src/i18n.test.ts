import { describe, expect, test } from "bun:test";

import { defaultI18nLocale, languageLabel, normalizeI18nLocale, translate, type TFunction } from "./i18n";

describe("i18n", () => {
  test("defaults to Simplified Chinese and normalizes supported locale aliases", () => {
    expect(defaultI18nLocale).toBe("zh-Hans");
    expect(normalizeI18nLocale(null)).toBe("zh-Hans");
    expect(normalizeI18nLocale("zh-CN")).toBe("zh-Hans");
    expect(normalizeI18nLocale("zh-HK")).toBe("zh-Hant");
    expect(normalizeI18nLocale("en-US")).toBe("en");
    expect(normalizeI18nLocale("fr-FR")).toBe("zh-Hans");
  });

  test("translates common dashboard labels with interpolation", () => {
    expect(translate("common.refresh", "zh-Hans")).toBe("刷新");
    expect(translate("common.refresh", "zh-Hant")).toBe("重新整理");
    expect(translate("common.refresh", "en")).toBe("Refresh");
    expect(translate("published.syncSuccess", "en", { imported: 1, updated: 2, archived: 3 })).toBe(
      "Sync complete: 1 imported, 2 updated, 3 archived"
    );
  });

  test("renders locale names through the active translator", () => {
    const t: TFunction = (key, params) => translate(key, "en", params);
    expect(languageLabel("zh-Hans", t)).toBe("Simplified Chinese");
    expect(languageLabel("zh-Hant", t)).toBe("Traditional Chinese");
    expect(languageLabel("en", t)).toBe("English");
  });
});

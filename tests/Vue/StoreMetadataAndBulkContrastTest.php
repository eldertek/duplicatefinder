<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Vue;

use DOMDocument;
use PHPUnit\Framework\TestCase;

class StoreMetadataAndBulkContrastTest extends TestCase
{
    public function testInfoXmlHasFourMainBranchScreenshotsAndThirtyEightLanguages(): void
    {
        $infoPath = __DIR__ . '/../../appinfo/info.xml';
        $content = file_get_contents($infoPath);
        $this->assertNotFalse($content);
        $this->assertStringNotContainsString("\u{2013}", $content);
        $this->assertStringNotContainsString("\u{2014}", $content);

        $dom = new DOMDocument();
        $this->assertTrue($dom->loadXML($content), 'appinfo/info.xml must be well-formed XML');

        $screenshots = [];
        foreach ($dom->getElementsByTagName('screenshot') as $node) {
            $screenshots[] = trim($node->textContent);
        }

        $this->assertSame([
            'https://raw.githubusercontent.com/eldertek/duplicatefinder/main/img/preview-light.png',
            'https://raw.githubusercontent.com/eldertek/duplicatefinder/main/img/preview-bulk-delete.png',
            'https://raw.githubusercontent.com/eldertek/duplicatefinder/main/img/preview-empty-folders.png',
            'https://raw.githubusercontent.com/eldertek/duplicatefinder/main/img/preview-dark.png',
        ], $screenshots);

        foreach (['preview-light.png', 'preview-bulk-delete.png', 'preview-empty-folders.png', 'preview-dark.png'] as $imgFile) {
            $imgPath = __DIR__ . '/../../img/' . $imgFile;
            $this->assertFileExists($imgPath);
            $this->assertGreaterThan(10000, filesize($imgPath));
        }

        $expectedLangs = [
            'en', 'ar', 'bg', 'ca', 'cs', 'da', 'de', 'el',
            'es', 'et', 'fi', 'fr', 'he', 'hr', 'hu', 'id',
            'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl',
            'pt', 'pt-br', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv',
            'th', 'tr', 'uk', 'vi', 'zh-hans', 'zh-hant',
        ];
        sort($expectedLangs);

        $officialInfoXsdLangs = [
            'af', 'ar', 'ast', 'az', 'bg', 'be', 'bn', 'br', 'bs', 'ca', 'cs', 'cy',
            'da', 'de', 'el', 'en', 'eo', 'es', 'es-ar', 'es-co', 'es-mx', 'es-ni',
            'es-ve', 'et', 'eu', 'fa', 'fi', 'fr', 'fy', 'ga', 'gd', 'gl', 'he', 'hi',
            'hr', 'hu', 'ia', 'id', 'io', 'is', 'it', 'ja', 'ka', 'kk', 'km', 'kn',
            'ko', 'lb', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'my', 'nb', 'ne', 'nl',
            'nn', 'os', 'pa', 'pl', 'pt', 'pt-br', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr',
            'sr-latn', 'sv', 'sw', 'ta', 'te', 'th', 'tr', 'tt', 'udm', 'uk', 'ur',
            'vi', 'zh-hans', 'zh-hant',
        ];

        $summaryLangs = [];
        foreach ($dom->getElementsByTagName('summary') as $node) {
            $lang = $node->hasAttribute('lang') ? $node->getAttribute('lang') : 'en';
            $this->assertContains($lang, $officialInfoXsdLangs, "Summary lang '{$lang}' must be valid in Nextcloud info.xsd");
            $summaryLangs[] = $lang;
            $summaryText = trim($node->textContent);
            $this->assertNotEmpty($summaryText, "Summary for {$lang} must not be empty");
            $this->assertLessThanOrEqual(
                128,
                mb_strlen($summaryText, 'UTF-8'),
                "Summary for {$lang} must respect Nextcloud info.xsd 128-char limit"
            );
        }

        $descriptionLangs = [];
        foreach ($dom->getElementsByTagName('description') as $node) {
            $lang = $node->hasAttribute('lang') ? $node->getAttribute('lang') : 'en';
            $this->assertContains($lang, $officialInfoXsdLangs, "Description lang '{$lang}' must be valid in Nextcloud info.xsd");
            $descriptionLangs[] = $lang;
            $this->assertNotEmpty(trim($node->textContent), "Description for {$lang} must not be empty");
        }

        sort($summaryLangs);
        sort($descriptionLangs);

        $this->assertSame($expectedLangs, $summaryLangs);
        $this->assertSame($expectedLangs, $descriptionLangs);
    }

    public function testBulkDeleteDisabledButtonHasHighContrastStylesInSourceAndBundle(): void
    {
        $vueContent = file_get_contents(__DIR__ . '/../../src/components/BulkDeletionSettings.vue');
        $bundleContent = file_get_contents(__DIR__ . '/../../js/duplicatefinder-main.js');

        $this->assertNotFalse($vueContent);
        $this->assertNotFalse($bundleContent);

        $this->assertStringContainsString('delete-selected-files-button', $vueContent);
        $this->assertStringContainsString('.delete-selected-files-button:disabled', $vueContent);
        $this->assertStringContainsString('--color-text-maxcontrast', $vueContent);

        $this->assertStringContainsString('delete-selected-files-button', $bundleContent);
    }
}

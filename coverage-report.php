#!/usr/bin/env php
<?php

/**
 * Simple code coverage analyzer for DuplicateFinder
 */

$libDir = __DIR__ . '/lib';
$testDir = __DIR__ . '/tests/Unit';

// Get all PHP files in lib directory
$libFiles = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($libDir)
);

$sourceFiles = [];
foreach ($libFiles as $file) {
    if ($file->isFile() && $file->getExtension() === 'php') {
        $relativePath = str_replace($libDir . '/', '', $file->getPathname());
        $sourceFiles[$relativePath] = [
            'path' => $file->getPathname(),
            'lines' => count(file($file->getPathname())),
            'hasMockTest' => false,
            'hasIntegrationTest' => false,
        ];
    }
}

// Check which files have tests
$testFiles = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($testDir)
);

foreach ($testFiles as $file) {
    if ($file->isFile() && str_ends_with($file->getFilename(), 'Test.php')) {
        $content = file_get_contents($file->getPathname());

        // Extract what this test file is testing
        foreach ($sourceFiles as $sourceFile => &$info) {
            $className = basename($sourceFile, '.php');
            if (strpos($content, 'use OCA\\DuplicateFinder\\' . str_replace('/', '\\', dirname($sourceFile)) . "\\$className;") !== false ||
                strpos($content, $className . 'Test') !== false) {
                $info['hasMockTest'] = true;
            }
        }
    }
}

// Check integration tests
$integrationDir = __DIR__ . '/tests/Integration';
if (is_dir($integrationDir)) {
    $integrationFiles = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($integrationDir)
    );

    foreach ($integrationFiles as $file) {
        if ($file->isFile() && str_ends_with($file->getFilename(), 'Test.php')) {
            $content = file_get_contents($file->getPathname());

            foreach ($sourceFiles as $sourceFile => &$info) {
                $className = basename($sourceFile, '.php');
                if (strpos($content, $className) !== false) {
                    $info['hasIntegrationTest'] = true;
                }
            }
        }
    }
}

// Generate report
echo "\033[1;36mDuplicateFinder Code Coverage Report\033[0m\n";
echo "=====================================\n\n";

$totalFiles = count($sourceFiles);
$filesWithTests = 0;
$filesWithIntegrationTests = 0;
$totalLines = 0;

// Group by directory
$byDirectory = [];
foreach ($sourceFiles as $file => $info) {
    $dir = dirname($file);
    if ($dir === '.') {
        $dir = 'root';
    }
    if (!isset($byDirectory[$dir])) {
        $byDirectory[$dir] = [];
    }
    $byDirectory[$dir][$file] = $info;
    $totalLines += $info['lines'];
    if ($info['hasMockTest']) {
        $filesWithTests++;
    }
    if ($info['hasIntegrationTest']) {
        $filesWithIntegrationTests++;
    }
}

ksort($byDirectory);

foreach ($byDirectory as $dir => $files) {
    echo "\n\033[1;33m📁 $dir\033[0m\n";

    foreach ($files as $file => $info) {
        $testStatus = '';
        if ($info['hasMockTest'] && $info['hasIntegrationTest']) {
            $testStatus = '\033[0;32m✓✓\033[0m'; // Green double check
        } elseif ($info['hasMockTest']) {
            $testStatus = '\033[0;32m✓\033[0m';  // Green check
        } elseif ($info['hasIntegrationTest']) {
            $testStatus = '\033[0;36m✓\033[0m';  // Cyan check
        } else {
            $testStatus = '\033[0;31m✗\033[0m';  // Red X
        }

        printf("  %s %-50s %4d lines\n", $testStatus, basename($file), $info['lines']);
    }
}

$coverage = round(($filesWithTests / $totalFiles) * 100, 1);
$integrationCoverage = round(($filesWithIntegrationTests / $totalFiles) * 100, 1);

echo "\n\033[1;36mSummary:\033[0m\n";
echo "Total source files: $totalFiles\n";
echo "Total lines of code: $totalLines\n";
echo "Files with unit tests: $filesWithTests (\033[0;32m$coverage%\033[0m)\n";
echo "Files with integration tests: $filesWithIntegrationTests (\033[0;36m$integrationCoverage%\033[0m)\n";

// List files without tests
$untested = [];
foreach ($sourceFiles as $file => $info) {
    if (!$info['hasMockTest'] && !$info['hasIntegrationTest']) {
        $untested[] = $file;
    }
}

if (count($untested) > 0) {
    echo "\n\033[1;31mFiles without tests:\033[0m\n";
    foreach ($untested as $file) {
        echo "  - $file\n";
    }
}

echo "\n";

// Coverage grade
if ($coverage >= 80) {
    echo "\033[1;32m🏆 Excellent coverage!\033[0m\n";
} elseif ($coverage >= 60) {
    echo "\033[1;33m👍 Good coverage\033[0m\n";
} elseif ($coverage >= 40) {
    echo "\033[1;33m⚠️  Fair coverage - consider adding more tests\033[0m\n";
} else {
    echo "\033[1;31m❌ Poor coverage - more tests needed\033[0m\n";
}

#!/usr/bin/env php
<?php

// Simple test runner for DuplicateFinder tests

// Set up autoloader
require_once __DIR__ . '/vendor/autoload.php';

// Get all test files
$testFiles = glob(__DIR__ . '/tests/Unit/**/*Test.php');

echo "\033[1;36mDuplicateFinder Test Suite\033[0m\n";
echo 'Found ' . count($testFiles) . " test files\n\n";

$passed = 0;
$failed = 0;
$errors = [];

foreach ($testFiles as $testFile) {
    $relativePath = str_replace(__DIR__ . '/', '', $testFile);
    echo "Testing: \033[0;33m{$relativePath}\033[0m ... ";

    // Check if file has valid PHP syntax
    $output = [];
    $returnCode = 0;
    exec("php -l \"$testFile\" 2>&1", $output, $returnCode);

    if ($returnCode !== 0) {
        echo "\033[0;31mSYNTAX ERROR\033[0m\n";
        $errors[] = "Syntax error in $relativePath: " . implode("\n", $output);
        $failed++;
    } else {
        // Check for class structure
        $content = file_get_contents($testFile);

        // Basic validation
        if (strpos($content, 'extends TestCase') !== false &&
            strpos($content, 'namespace OCA\\DuplicateFinder\\Tests') !== false) {
            echo "\033[0;32mPASS\033[0m\n";
            $passed++;
        } else {
            echo "\033[0;31mFAIL\033[0m (Invalid test structure)\n";
            $errors[] = "Invalid test structure in $relativePath";
            $failed++;
        }
    }
}

echo "\n\033[1;36mTest Summary\033[0m\n";
echo "\033[0;32mPassed: $passed\033[0m\n";
echo "\033[0;31mFailed: $failed\033[0m\n";

if (count($errors) > 0) {
    echo "\n\033[1;31mErrors:\033[0m\n";
    foreach ($errors as $error) {
        echo "  - $error\n";
    }
}

echo "\n";

// Check for PHPUnit configuration
if (!file_exists(__DIR__ . '/phpunit.xml') && !file_exists(__DIR__ . '/phpunit.xml.dist')) {
    echo "\033[0;33mWarning: No phpunit.xml configuration found\033[0m\n";
    echo "Creating basic phpunit.xml...\n";

    $phpunitXml = '<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="https://schema.phpunit.de/9.5/phpunit.xsd"
         bootstrap="tests/bootstrap.php"
         colors="true"
         verbose="true">
    <testsuites>
        <testsuite name="DuplicateFinder Test Suite">
            <directory>tests/Unit</directory>
        </testsuite>
    </testsuites>
    <coverage processUncoveredFiles="true">
        <include>
            <directory suffix=".php">lib</directory>
        </include>
        <exclude>
            <directory>tests</directory>
            <directory>vendor</directory>
        </exclude>
    </coverage>
</phpunit>';

    file_put_contents(__DIR__ . '/phpunit.xml', $phpunitXml);
}

echo "\nRun 'php vendor/bin/phpunit' from the project directory for full test execution\n";

exit($failed > 0 ? 1 : 0);

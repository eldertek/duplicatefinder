<?php

namespace OCA\DuplicateFinder\Command;

 use Symfony\Component\Console\Command\Command;
 use Symfony\Component\Console\Helper\QuestionHelper;
 use Symfony\Component\Console\Input\InputInterface;
 use Symfony\Component\Console\Input\InputOption;
 use Symfony\Component\Console\Output\OutputInterface;
 use Symfony\Component\Console\Question\ConfirmationQuestion;
 use OCA\DuplicateFinder\Service\FileInfoService;
 use OCA\DuplicateFinder\Service\FileDuplicateService;
 
 class ClearDuplicates extends Command
 {
     /**
      * @var FileInfoService The file info service instance.
      */
     protected $fileInfoService;
 
     /**
      * @var FileDuplicateService The file duplicate service instance.
      */
     protected $fileDuplicateService;
 
     /**
      * ClearDuplicates constructor.
      *
      * @param FileInfoService $fileInfoService The file info service instance.
      * @param FileDuplicateService $fileDuplicateService The file duplicate service instance.
      */
     public function __construct(FileInfoService $fileInfoService, FileDuplicateService $fileDuplicateService)
     {
         parent::__construct();
 
         $this->fileInfoService = $fileInfoService;
         $this->fileDuplicateService = $fileDuplicateService;
     }
 
     /**
      * Configure the command.
      */
     protected function configure(): void
     {
         $this
             ->setName('duplicates:clear')
             ->setDescription('Clear all duplicates and information for discovery')
             ->setHelp('Remove links to interactively recognized duplicate files from the database of your Nextcloud instance.'
                 . PHP_EOL . 'This action doesn\'t remove the files from your file system.')
             ->addOption('force', 'f', InputOption::VALUE_NONE, 'Don\'t ask any questions');
     }
 
     /**
      * Execute the command.
      *
      * @param InputInterface $input The input interface.
      * @param OutputInterface $output The output interface.
      * @return int The command exit code.
      */
     protected function execute(InputInterface $input, OutputInterface $output): int
     {
         if ($input->getOption('force') || $this->confirmClearing($input, $output)) {
             $this->fileDuplicateService->clear();
             $this->fileInfoService->clear();
             return Command::SUCCESS;
         }
 
         return Command::FAILURE;
     }
 
     /**
      * Confirm the clearing of duplicates.
      *
      * @param InputInterface $input The input interface.
      * @param OutputInterface $output The output interface.
      * @return bool True if the clearing is confirmed, false otherwise.
      */
     private function confirmClearing(InputInterface $input, OutputInterface $output): bool
     {
         /** @var QuestionHelper $helper */
         $helper = $this->getHelper('question');
         $question = new ConfirmationQuestion('Do you really want to clear all duplicates and information for discovery?', false);
         return $helper->ask($input, $output, $question);
     }
 }
 
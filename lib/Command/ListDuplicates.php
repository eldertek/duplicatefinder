<?php

namespace OCA\DuplicateFinder\Command;

 use OCA\DuplicateFinder\Service\FileDuplicateService;
 use OCA\DuplicateFinder\Service\FileInfoService;
 use OCA\DuplicateFinder\Utils\CMDUtils;
 use OCP\Encryption\IManager;
 use OCP\IDBConnection;
 use OCP\IUserManager;
 use Symfony\Component\Console\Command\Command;
 use Symfony\Component\Console\Input\InputInterface;
 use Symfony\Component\Console\Input\InputOption;
 use Symfony\Component\Console\Output\OutputInterface;
 
 class ListDuplicates extends Command
 {
     /**
      * @var IUserManager The user manager instance.
      */
     private $userManager;
 
     /**
      * @var IManager The encryption manager instance.
      */
     private $encryptionManager;
 
     /**
      * @var IDBConnection The database connection instance.
      */
     private $connection;
 
     /**
      * @var FileInfoService The file info service instance.
      */
     private $fileInfoService;
 
     /**
      * @var FileDuplicateService The file duplicate service instance.
      */
     private $fileDuplicateService;
 
     /**
      * @var OutputInterface The output interface.
      */
     private $output;
 
     /**
      * ListDuplicates constructor.
      *
      * @param IUserManager $userManager The user manager instance.
      * @param IManager $encryptionManager The encryption manager instance.
      * @param IDBConnection $connection The database connection instance.
      * @param FileInfoService $fileInfoService The file info service instance.
      * @param FileDuplicateService $fileDuplicateService The file duplicate service instance.
      */
     public function __construct(
         IUserManager $userManager,
         IManager $encryptionManager,
         IDBConnection $connection,
         FileInfoService $fileInfoService,
         FileDuplicateService $fileDuplicateService
     ) {
         parent::__construct('duplicates:list');
 
         $this->userManager = $userManager;
         $this->encryptionManager = $encryptionManager;
         $this->connection = $connection;
         $this->fileInfoService = $fileInfoService;
         $this->fileDuplicateService = $fileDuplicateService;
     }
 
     /**
      * Configure the command.
      */
     protected function configure(): void
     {
         $this
             ->setDescription('List all duplicate files')
             ->addOption('user', 'u', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'List files of the specified user');
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
         $this->output = $output;
 
         if ($this->encryptionManager->isEnabled()) {
             $output->writeln('Encryption is enabled. Aborted.');
             return 1;
         }
 
         $users = (array)$input->getOption('user');
 
         return (!empty($users)) ? $this->listDuplicatesForUsers($users) : $this->listAllDuplicates();
     }
 
     /**
      * List duplicates for the specified users.
      *
      * @param array $users The array of user names.
      * @return int The command exit code.
      */
     private function listDuplicatesForUsers(array $users): int
     {
         foreach ($users as $user) {
             if (!$this->userManager->userExists($user)) {
                 $this->output->writeln('User ' . $user . ' is unknown.');
                 return 1;
             }
 
             CMDUtils::showDuplicates($this->fileDuplicateService, $this->output, function() {}, $user);
         }
 
         return 0;
     }
 
     /**
      * List all duplicates for all users.
      *
      * @return int The command exit code.
      */
     private function listAllDuplicates(): int
     {
         // Assuming you want to list duplicates for all users, you might need to iterate over all users
         $users = $this->userManager->search('');
         foreach ($users as $user) {
             CMDUtils::showDuplicates($this->fileDuplicateService, $this->output, function() {}, $user->getUID());
         }
         return 0;
     }
 }
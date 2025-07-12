<?php

namespace OCA\DuplicateFinder\Settings;

use OCA\DuplicateFinder\AppInfo\Application;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

class Section implements IIconSection
{
    /** @var IL10N */
    private $l;
    /** @var IURLGenerator */
    private $url;

    /**
     * @param IURLGenerator $url
     * @param IL10N $l
     */
    public function __construct(IURLGenerator $url, IL10N $l)
    {
        $this->url = $url;
        $this->l = $l;
    }

    public function getID(): string
    {
        return Application::ID;
    }

    public function getName(): string
    {
        return $this->l->t('Duplicate Finder');
    }

    public function getPriority()
    {
        return 25;
    }

    public function getIcon(): string
    {
        return $this->url->imagePath(Application::ID, 'app-dark.svg');
    }
}

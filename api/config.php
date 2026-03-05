<?php
declare(strict_types=1);

const BDD_HOTE = 'localhost';
const BDD_PORT = '3306';
const BDD_NOM = 'bibliotheque_fr';
const BDD_UTILISATEUR = 'boygreg';
const BDD_MOT_DE_PASSE = 'Ayite@2006';

const SESSION_NOM = 'bibliotheque_fr';

const APP_FUSEAU = 'Africa/Lome';

date_default_timezone_set(APP_FUSEAU);

if (is_dir('/tmp') && is_writable('/tmp')) {
    ini_set('session.save_path', '/tmp');
}

const DEMO_COMPTE_EMAIL = 'demo@esgis.org';
const DEMO_COMPTE_MOT_DE_PASSE = 'demo1234';
const DEMO_COMPTE_NOM = 'Demo Bibliotheque';

const DEMO_ADMIN_IDENTIFIANT = 'demo.admin';
const DEMO_ADMIN_MOT_DE_PASSE = 'demo1234';
const DEMO_ADMIN_CODE = '1234';

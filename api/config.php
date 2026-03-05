<?php
declare(strict_types=1);

// Basculer automatiquement local <-> InfinityFree selon l'hôte courant.
$hoteHttp = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$hoteSansPort = explode(':', $hoteHttp)[0] ?? '';
$enLocal = in_array($hoteSansPort, ['localhost', '127.0.0.1'], true)
    || str_ends_with($hoteSansPort, '.local');

define('BDD_HOTE', $enLocal ? 'localhost' : 'sql213.infinityfree.com');
define('BDD_PORT', '3306');
define('BDD_NOM', $enLocal ? 'bibliotheque_fr' : 'if0_41308710_gestionBiblio');
define('BDD_UTILISATEUR', $enLocal ? 'boygreg' : 'if0_41308710');
define('BDD_MOT_DE_PASSE', $enLocal ? 'Ayite@2006' : 'Ayite012006');

const SESSION_NOM = 'bibliotheque_fr';

const APP_FUSEAU = 'Africa/Lome';

date_default_timezone_set(APP_FUSEAU);

if (is_dir('/tmp') && is_writable('/tmp')) {
    ini_set('session.save_path', '/tmp');
}

const DEMO_COMPTE_EMAIL = '';
const DEMO_COMPTE_MOT_DE_PASSE = '';
const DEMO_COMPTE_NOM = 'Administrateur';

const DEMO_ADMIN_IDENTIFIANT = 'biblio.admin';
const DEMO_ADMIN_MOT_DE_PASSE = 'ADMIN2026';
const DEMO_ADMIN_CODE = '2026';

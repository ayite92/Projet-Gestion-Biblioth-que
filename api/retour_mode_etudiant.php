<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();

demarrerSessionSiBesoin();
$_SESSION['acces_admin_valide'] = false;
$_SESSION['admin_utilisateur_id'] = null;

enregistrerJournalAudit('retour_mode_etudiant', 'utilisateurs', (int) $utilisateur['id'], 'Retour au mode étudiant', (int) $utilisateur['id']);

envoyerJson(['ok' => true, 'message' => 'Mode étudiant réactivé.']);

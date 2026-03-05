<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$reclamationId = (int) ($donnees['reclamation_id'] ?? 0);
$statut = trim((string) ($donnees['statut'] ?? ''));

$statutsAutorises = ['ouverte', 'en_traitement', 'resolue', 'rejetee'];
if ($reclamationId <= 0 || !in_array($statut, $statutsAutorises, true)) {
    envoyerJson(['ok' => false, 'message' => 'reclamation_id ou statut invalide.'], 422);
}

$adminId = (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']);
$resolueLe = in_array($statut, ['resolue', 'rejetee'], true) ? date('Y-m-d H:i:s') : null;

$pdo = obtenirConnexionBdd();
$stmt = $pdo->prepare(
    'UPDATE reclamations
     SET statut = :statut,
         admin_assigne_id = :admin_assigne_id,
         resolue_le = :resolue_le
     WHERE id = :id'
);
$stmt->execute([
    'statut' => $statut,
    'admin_assigne_id' => $adminId,
    'resolue_le' => $resolueLe,
    'id' => $reclamationId,
]);

if ($stmt->rowCount() === 0) {
    envoyerJson(['ok' => false, 'message' => 'Réclamation introuvable ou inchangée.'], 404);
}

enregistrerJournalAudit('changement_statut_reclamation', 'reclamations', $reclamationId, 'Changement de statut: ' . $statut, (int) $utilisateur['id']);

envoyerJson(['ok' => true, 'message' => 'Statut de réclamation mis à jour.']);

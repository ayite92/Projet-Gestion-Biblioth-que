<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
$donnees = lireCorpsJson();

$reclamationId = (int) ($donnees['reclamation_id'] ?? 0);
$message = trim((string) ($donnees['message'] ?? ''));

if ($reclamationId <= 0 || $message === '') {
    envoyerJson(['ok' => false, 'message' => 'reclamation_id et message sont requis.'], 422);
}

$pdo = obtenirConnexionBdd();

$stmtReclamation = $pdo->prepare(
    'SELECT r.id, r.etudiant_id, e.utilisateur_id AS etudiant_utilisateur_id
     FROM reclamations r
     INNER JOIN etudiants e ON e.id = r.etudiant_id
     WHERE r.id = :id
     LIMIT 1'
);
$stmtReclamation->execute(['id' => $reclamationId]);
$reclamation = $stmtReclamation->fetch();

if (!$reclamation) {
    envoyerJson(['ok' => false, 'message' => 'Réclamation introuvable.'], 404);
}

$estProprietaire = ((int) $reclamation['etudiant_utilisateur_id'] === (int) $utilisateur['id']);
$estAdmin = accesAdministrateurValide();

if (!$estProprietaire && !$estAdmin) {
    envoyerJson(['ok' => false, 'message' => 'Vous ne pouvez pas répondre à cette réclamation.'], 403);
}

$pdo->beginTransaction();
try {
    $stmtMessage = $pdo->prepare(
        'INSERT INTO messages_reclamation (reclamation_id, expediteur_utilisateur_id, message)
         VALUES (:reclamation_id, :expediteur_utilisateur_id, :message)'
    );
    $stmtMessage->execute([
        'reclamation_id' => $reclamationId,
        'expediteur_utilisateur_id' => (int) $utilisateur['id'],
        'message' => $message,
    ]);

    if ($estAdmin) {
        $stmtMaj = $pdo->prepare(
            'UPDATE reclamations
             SET statut = CASE WHEN statut = "ouverte" THEN "en_traitement" ELSE statut END,
                 admin_assigne_id = :admin_id
             WHERE id = :id'
        );
        $stmtMaj->execute([
            'admin_id' => (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']),
            'id' => $reclamationId,
        ]);
    }

    $pdo->commit();

    enregistrerJournalAudit('reponse_reclamation', 'reclamations', $reclamationId, 'Ajout d\'un message sur réclamation', (int) $utilisateur['id']);

    envoyerJson(['ok' => true, 'message' => 'Réponse enregistrée.']);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible d\'enregistrer la réponse.', 'erreur' => $e->getMessage()], 500);
}

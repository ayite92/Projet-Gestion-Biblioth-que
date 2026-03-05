<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$duree = (int) ($donnees['duree_max_emprunt_jours'] ?? 0);
$penalite = (float) ($donnees['montant_penalite_journalier'] ?? -1);
$quota = (int) ($donnees['quota_max_emprunts_actifs'] ?? 0);

if ($duree < 1 || $duree > 365) {
    envoyerJson(['ok' => false, 'message' => 'Durée max emprunt invalide.'], 422);
}
if ($penalite < 0) {
    envoyerJson(['ok' => false, 'message' => 'Montant pénalité invalide.'], 422);
}
if ($quota < 1 || $quota > 50) {
    envoyerJson(['ok' => false, 'message' => 'Quota max emprunts actifs invalide.'], 422);
}

$pdo = obtenirConnexionBdd();
$adminId = (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']);

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare(
        'INSERT INTO parametres_application (cle, valeur, modifie_par)
         VALUES (:cle, :valeur, :modifie_par)
         ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), modifie_par = VALUES(modifie_par)'
    );

    $stmt->execute([
        'cle' => 'duree_max_emprunt_jours',
        'valeur' => (string) $duree,
        'modifie_par' => $adminId,
    ]);
    $stmt->execute([
        'cle' => 'montant_penalite_journalier',
        'valeur' => number_format($penalite, 2, '.', ''),
        'modifie_par' => $adminId,
    ]);
    $stmt->execute([
        'cle' => 'quota_max_emprunts_actifs',
        'valeur' => (string) $quota,
        'modifie_par' => $adminId,
    ]);

    enregistrerJournalAudit('mise_a_jour_parametres', 'parametres_application', null, 'Mise à jour paramètres métier', $adminId);
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible de mettre à jour les paramètres.', 'erreur' => $e->getMessage()], 500);
}

envoyerJson([
    'ok' => true,
    'message' => 'Paramètres mis à jour avec succès.',
    'parametres' => [
        'duree_max_emprunt_jours' => $duree,
        'montant_penalite_journalier' => number_format($penalite, 2, '.', ''),
        'quota_max_emprunts_actifs' => $quota,
    ],
]);

<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$etudiantId = (int) ($donnees['etudiant_id'] ?? 0);
if ($etudiantId <= 0) {
    envoyerJson(['ok' => false, 'message' => 'etudiant_id invalide.'], 422);
}

$pdo = obtenirConnexionBdd();
$adminId = (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']);

$pdo->beginTransaction();
try {
    $stmtEtudiant = $pdo->prepare('SELECT id, utilisateur_id, matricule FROM etudiants WHERE id = :id LIMIT 1');
    $stmtEtudiant->execute(['id' => $etudiantId]);
    $etudiant = $stmtEtudiant->fetch();

    if (!$etudiant) {
        envoyerJson(['ok' => false, 'message' => 'Étudiant introuvable.'], 404);
    }

    $stmtEmprunts = $pdo->prepare('SELECT COUNT(*) AS total FROM emprunts WHERE etudiant_id = :etudiant_id');
    $stmtEmprunts->execute(['etudiant_id' => $etudiantId]);
    $nbEmprunts = (int) ($stmtEmprunts->fetch()['total'] ?? 0);

    $stmtReclamations = $pdo->prepare('SELECT COUNT(*) AS total FROM reclamations WHERE etudiant_id = :etudiant_id');
    $stmtReclamations->execute(['etudiant_id' => $etudiantId]);
    $nbReclamations = (int) ($stmtReclamations->fetch()['total'] ?? 0);

    $nouveauMatricule = sprintf('DEL%d-%s', $etudiantId, (string) $etudiant['matricule']);

    $stmtDesactiverEtudiant = $pdo->prepare(
        'UPDATE etudiants
         SET statut = :statut, utilisateur_id = NULL, matricule = :matricule
         WHERE id = :id'
    );
    $stmtDesactiverEtudiant->execute([
        'statut' => 'suspendu',
        'matricule' => $nouveauMatricule,
        'id' => $etudiantId,
    ]);

    if (!empty($etudiant['utilisateur_id'])) {
        $stmtDelUser = $pdo->prepare('DELETE FROM utilisateurs WHERE id = :id');
        $stmtDelUser->execute(['id' => (int) $etudiant['utilisateur_id']]);
    }

    $description = ($nbEmprunts > 0 || $nbReclamations > 0)
        ? 'Suppression logique étudiant (historique conservé, accès révoqué)'
        : 'Suppression logique étudiant (sans historique actif)';
    enregistrerJournalAudit('suppression_etudiant', 'etudiants', $etudiantId, $description, $adminId);

    $pdo->commit();
    envoyerJson(['ok' => true, 'message' => 'Étudiant supprimé avec succès. Accès révoqué, réinscription possible.']);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible de supprimer l\'étudiant.', 'erreur' => $e->getMessage()], 500);
}

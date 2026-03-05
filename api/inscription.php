<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$donnees = lireCorpsJson();

$nomComplet = trim((string) ($donnees['nom_complet'] ?? ''));
$email = mb_strtolower(trim((string) ($donnees['email'] ?? '')));
$motDePasse = (string) ($donnees['mot_de_passe'] ?? '');
$emailBanni = 'email.bibliotheque@esgis.org';
$typeAdherent = trim((string) ($donnees['type_adherent'] ?? 'etudiant'));
$typeAdherent = in_array($typeAdherent, ['etudiant', 'enseignant'], true) ? $typeAdherent : 'etudiant';
$filiere = trim((string) ($donnees['filiere'] ?? ''));
$niveau = trim((string) ($donnees['niveau'] ?? ''));

if ($email === '' || $motDePasse === '') {
    envoyerJson(['ok' => false, 'message' => 'Email et mot de passe requis.'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    envoyerJson(['ok' => false, 'message' => 'Format email invalide.'], 422);
}

if ($email === $emailBanni) {
    envoyerJson(['ok' => false, 'message' => 'Cette adresse email est bloquée.'], 422);
}

if ($filiere === '' || $niveau === '') {
    envoyerJson(['ok' => false, 'message' => 'Filière et niveau sont requis.'], 422);
}

if ($nomComplet === '') {
    $nomComplet = strstr($email, '@', true) ?: ($typeAdherent === 'enseignant' ? 'Enseignant' : 'Étudiant');
}

$pdo = obtenirConnexionBdd();
$roleNom = $typeAdherent === 'enseignant' ? 'enseignant' : 'etudiant';
$roleId = idRoleParNom($pdo, $roleNom);
if (!$roleId && $roleNom === 'enseignant') {
    $stmtRole = $pdo->prepare('INSERT INTO roles(nom) VALUES (:nom)');
    try {
        $stmtRole->execute(['nom' => 'enseignant']);
    } catch (Throwable $e) {
        // rôle déjà créé par une autre requête
    }
    $roleId = idRoleParNom($pdo, $roleNom);
}
if (!$roleId) {
    envoyerJson(['ok' => false, 'message' => 'Rôle adhérent introuvable dans la base.'], 500);
}

$hash = password_hash($motDePasse, PASSWORD_DEFAULT);

$pdo->beginTransaction();
try {
    $stmtExistant = $pdo->prepare('SELECT id, est_actif FROM utilisateurs WHERE email = :email LIMIT 1');
    $stmtExistant->execute(['email' => $email]);
    $existant = $stmtExistant->fetch();

    if ($existant) {
        if ((int) ($existant['est_actif'] ?? 0) !== 1) {
            $ancienUtilisateurId = (int) $existant['id'];
            $stmtAncienProfil = $pdo->prepare('SELECT id, matricule FROM etudiants WHERE utilisateur_id = :utilisateur_id LIMIT 1');
            $stmtAncienProfil->execute(['utilisateur_id' => $ancienUtilisateurId]);
            $ancienProfil = $stmtAncienProfil->fetch();

            if ($ancienProfil) {
                $matriculeArchive = sprintf('DEL%d-%s', (int) $ancienProfil['id'], (string) ($ancienProfil['matricule'] ?? ''));
                $stmtArchiveProfil = $pdo->prepare(
                    'UPDATE etudiants
                     SET statut = :statut, utilisateur_id = NULL, matricule = :matricule
                     WHERE id = :id'
                );
                $stmtArchiveProfil->execute([
                    'statut' => 'suspendu',
                    'matricule' => $matriculeArchive,
                    'id' => (int) $ancienProfil['id'],
                ]);
            }

            $stmtDeleteUser = $pdo->prepare('DELETE FROM utilisateurs WHERE id = :id');
            $stmtDeleteUser->execute(['id' => $ancienUtilisateurId]);
            $existant = false;
        }
    }

    if ($existant) {
        $stmtMaj = $pdo->prepare(
            'UPDATE utilisateurs
             SET nom_complet = :nom_complet, mot_de_passe_hash = :mot_de_passe_hash, role_id = :role_id
             WHERE id = :id'
        );
        $stmtMaj->execute([
            'nom_complet' => $nomComplet,
            'mot_de_passe_hash' => $hash,
            'role_id' => $roleId,
            'id' => (int) $existant['id'],
        ]);
        $utilisateurId = (int) $existant['id'];
    } else {
        $stmtInsertion = $pdo->prepare(
            'INSERT INTO utilisateurs (nom_complet, email, mot_de_passe_hash, role_id)
             VALUES (:nom_complet, :email, :mot_de_passe_hash, :role_id)'
        );
        $stmtInsertion->execute([
            'nom_complet' => $nomComplet,
            'email' => $email,
            'mot_de_passe_hash' => $hash,
            'role_id' => $roleId,
        ]);
        $utilisateurId = (int) $pdo->lastInsertId();
    }

    $stmtProfilEtudiant = $pdo->prepare('SELECT id, statut FROM etudiants WHERE utilisateur_id = :utilisateur_id LIMIT 1');
    $stmtProfilEtudiant->execute(['utilisateur_id' => $utilisateurId]);
    $profilEtudiant = $stmtProfilEtudiant->fetch();

    $matriculeFinal = null;
    if (!$profilEtudiant) {
        $filiereParDefaut = $filiere;
        $niveauParDefaut = $niveau;
        $stmtInsertEtudiant = $pdo->prepare(
            'INSERT INTO etudiants (utilisateur_id, matricule, filiere, niveau, date_inscription, statut)
             VALUES (:utilisateur_id, :matricule, :filiere, :niveau, :date_inscription, :statut)'
        );

        $matriculeInsere = false;
        for ($tentative = 0; $tentative < 5; $tentative++) {
            $matriculeCandidat = genererMatriculeAdherent($pdo, $typeAdherent, $tentative);
            try {
                $stmtInsertEtudiant->execute([
                    'utilisateur_id' => $utilisateurId,
                    'matricule' => $matriculeCandidat,
                    'filiere' => $filiereParDefaut,
                    'niveau' => $niveauParDefaut,
                    'date_inscription' => date('Y-m-d'),
                    'statut' => 'actif',
                ]);
                $matriculeFinal = $matriculeCandidat;
                $matriculeInsere = true;
                break;
            } catch (Throwable $e) {
                if (!estErreurDoublon($e)) {
                    throw $e;
                }
            }
        }

        if (!$matriculeInsere) {
            throw new RuntimeException('Impossible de générer un matricule unique pour cet adhérent.');
        }
    } else {
        if (($profilEtudiant['statut'] ?? '') === 'suspendu') {
            throw new RuntimeException('Compte adhérent suspendu. Réactivation par administrateur requise.');
        }

        $stmtMajEtudiant = $pdo->prepare(
            'UPDATE etudiants
             SET filiere = :filiere, niveau = :niveau
             WHERE utilisateur_id = :utilisateur_id'
        );
        $stmtMajEtudiant->execute([
            'filiere' => $filiere,
            'niveau' => $niveau,
            'utilisateur_id' => $utilisateurId,
        ]);

        $stmtMatricule = $pdo->prepare('SELECT matricule FROM etudiants WHERE utilisateur_id = :utilisateur_id LIMIT 1');
        $stmtMatricule->execute(['utilisateur_id' => $utilisateurId]);
        $matriculeFinal = (string) ($stmtMatricule->fetchColumn() ?: '');
    }

    $typeLabel = $typeAdherent === 'enseignant' ? 'Enseignant' : 'Étudiant';
    $stmtNotif = $pdo->prepare(
        'INSERT INTO notifications (utilisateur_id, titre, message, type, est_lue)
         VALUES (NULL, :titre, :message, :type, 0)'
    );
    $stmtNotif->execute([
        'titre' => 'Nouvelle inscription',
        'message' => sprintf('%s inscrit: %s.', $typeLabel, $nomComplet),
        'type' => 'succes',
    ]);

    $pdo->commit();

    enregistrerJournalAudit('inscription', 'utilisateurs', $utilisateurId, 'Inscription ou mise à jour compte étudiant', $utilisateurId);

    envoyerJson([
        'ok' => true,
        'message' => 'Inscription adhérent réussie.',
        'utilisateur' => [
            'id' => $utilisateurId,
            'nom_complet' => $nomComplet,
            'email' => $email,
            'role' => $roleNom,
            'matricule' => $matriculeFinal,
        ],
    ]);
} catch (Throwable $e) {
    $pdo->rollBack();
    if ($e instanceof RuntimeException) {
        envoyerJson(['ok' => false, 'message' => $e->getMessage()], 409);
    }
    envoyerJson(['ok' => false, 'message' => 'Erreur lors de l\'inscription.', 'erreur' => $e->getMessage()], 500);
}

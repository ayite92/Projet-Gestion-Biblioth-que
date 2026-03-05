<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/connexion_bdd.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

set_exception_handler(static function (Throwable $e): void {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'message' => 'Erreur serveur interne.',
        'erreur' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
});

function demarrerSessionSiBesoin(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_name(SESSION_NOM);
        session_start();
    }
}

function viderSessionLocale(): void
{
    demarrerSessionSiBesoin();
    $_SESSION = [];
}

function envoyerJson(array $payload, int $codeHttp = 200): void
{
    http_response_code($codeHttp);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function exigerMethode(string $methode): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== strtoupper($methode)) {
        envoyerJson(['ok' => false, 'message' => 'Méthode HTTP non autorisée.'], 405);
    }
}

function lireCorpsJson(): array
{
    $contenu = file_get_contents('php://input');
    if (!$contenu) {
        return [];
    }

    $json = json_decode($contenu, true);
    if (!is_array($json)) {
        envoyerJson(['ok' => false, 'message' => 'Corps JSON invalide.'], 400);
    }

    return $json;
}

function utilisateurConnecte(): ?array
{
    demarrerSessionSiBesoin();
    $utilisateurSession = $_SESSION['utilisateur'] ?? null;
    if (!is_array($utilisateurSession)) {
        return null;
    }

    $utilisateurId = (int) ($utilisateurSession['id'] ?? 0);
    if ($utilisateurId <= 0) {
        viderSessionLocale();
        return null;
    }

    try {
        $pdo = obtenirConnexionBdd();
        $stmt = $pdo->prepare(
            'SELECT u.id, u.nom_complet, u.email, u.est_actif, r.nom AS role_nom
             FROM utilisateurs u
             INNER JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $utilisateurId]);
        $utilisateur = $stmt->fetch();

        if (!$utilisateur || (int) $utilisateur['est_actif'] !== 1) {
            viderSessionLocale();
            return null;
        }

        $_SESSION['utilisateur'] = [
            'id' => (int) $utilisateur['id'],
            'nom_complet' => (string) $utilisateur['nom_complet'],
            'email' => (string) $utilisateur['email'],
            'role_nom' => (string) $utilisateur['role_nom'],
        ];

        return $_SESSION['utilisateur'];
    } catch (Throwable $e) {
        // En cas d'indisponibilité DB, conserver temporairement la session existante.
        return $utilisateurSession;
    }
}

function exigerConnexion(): array
{
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        envoyerJson(['ok' => false, 'message' => 'Authentification requise.'], 401);
    }
    return $utilisateur;
}

function accesAdministrateurValide(): bool
{
    demarrerSessionSiBesoin();
    return (bool) ($_SESSION['acces_admin_valide'] ?? false);
}

function exigerAccesAdministrateur(): void
{
    if (!accesAdministrateurValide()) {
        envoyerJson(['ok' => false, 'message' => 'Accès administrateur requis.'], 403);
    }
}

function enregistrerJournalAudit(
    string $action,
    string $entite,
    ?int $entiteId,
    ?string $description = null,
    ?int $utilisateurId = null
): void {
    try {
        $pdo = obtenirConnexionBdd();
        $stmt = $pdo->prepare(
            'INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, description, adresse_ip)
             VALUES (:utilisateur_id, :action, :entite, :entite_id, :description, :adresse_ip)'
        );
        $stmt->execute([
            'utilisateur_id' => $utilisateurId,
            'action' => $action,
            'entite' => $entite,
            'entite_id' => $entiteId,
            'description' => $description,
            'adresse_ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (Throwable $e) {
        // Ne pas bloquer la requête métier si le journal échoue.
    }
}

function idRoleParNom(PDO $pdo, string $nomRole): ?int
{
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE nom = :nom LIMIT 1');
    $stmt->execute(['nom' => $nomRole]);
    $role = $stmt->fetch();

    return $role ? (int) $role['id'] : null;
}

function estErreurDoublon(Throwable $e): bool
{
    if (!$e instanceof PDOException) {
        return false;
    }

    $sqlState = (string) ($e->errorInfo[0] ?? $e->getCode() ?? '');
    return $sqlState === '23000';
}

function genererMatriculeAdherent(PDO $pdo, string $typeAdherent, int $offset = 0): string
{
    $prefixe = $typeAdherent === 'enseignant' ? 'ENS' : 'ETU';
    $annee = date('Y');
    $regex = sprintf('^%s-%s-[0-9]{6}$', $prefixe, $annee);

    $stmt = $pdo->prepare(
        "SELECT MAX(CAST(SUBSTRING_INDEX(matricule, '-', -1) AS UNSIGNED)) AS dernier_numero
         FROM etudiants
         WHERE matricule REGEXP :regex"
    );
    $stmt->execute(['regex' => $regex]);
    $dernierNumero = (int) ($stmt->fetchColumn() ?: 0);
    $prochainNumero = $dernierNumero + 1 + max(0, $offset);

    return sprintf('%s-%s-%06d', $prefixe, $annee, $prochainNumero);
}

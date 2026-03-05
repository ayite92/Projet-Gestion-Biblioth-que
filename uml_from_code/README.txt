Diagrammes UML basés sur le code actuel (JS + API + SQL)

Fichiers:
- 01_cas_utilisation_from_code.puml
- 02_classe_from_code.puml
- 03_activite_from_code.puml
- 04_sequence_from_code.puml

Ces diagrammes reflètent les règles métier codées actuellement:
- Quota d'emprunts actifs (paramètre quota_max_emprunts_actifs)
- Blocage en cas de retards actifs
- Réservation côté front pour livre indisponible
- Pénalité calculée au retour

Si PlantUML est disponible:
plantuml 01_cas_utilisation_from_code.puml
plantuml 02_classe_from_code.puml
plantuml 03_activite_from_code.puml
plantuml 04_sequence_from_code.puml

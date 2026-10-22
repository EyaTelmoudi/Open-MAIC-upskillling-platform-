# 🎬 Scénario de la démo — Open-MAIC Upskilling Platform

> Document d'accompagnement de la section **[🎬 Démo vidéo](./README.md#-démo-vidéo)**.
> Il sert à (1) filmer la démo, (2) la publier, (3) donner au jury / recruteur un plan de lecture.

| | |
| --- | --- |
| **Vidéo publiée** | [`lv_0_20260619174011.mp4`](https://drive.google.com/file/d/1ZeWitpTY4NvPj-WZSoVN0C_LsmTcevwN/view?usp=drive_link) |
| **Lien de téléchargement direct** | [`uc?export=download&id=1ZeWitpTY4NvPj-WZSoVN0C_LsmTcevwN`](https://drive.google.com/uc?export=download&id=1ZeWitpTY4NvPj-WZSoVN0C_LsmTcevwN) |
| **Taille / format** | ~30 Mo · MP4 (H.264) · lisible directement dans le README via la vignette Drive |
| **Durée cible** | 9 min (version longue) · 3 min (version courte) |
| **Format de captation** | 1920×1080, 30 fps, voix off seule (pas de micro), fond de terminal sombre |

---

## 1. 🎯 Pourquoi une démo

Le README prouve la **structure** (architecture, stack, tests, métriques). La démo prouve le **comportement** :

- le multi-tenancy n'est pas une abstraction : on voit deux tenants cloisonnés ;
- la « mémoire apprenant » n'est pas une métaphore : on voit l'agent se souvenir d'un détail ;
- les agents IA n'hallucinent pas en自由 : la réponse de coaching est ancrée dans les passages récupérés.

> 🎥 **Message clef à faire passer** : *« un LMS multi-tenant complet, dont les cours sont générés par des agents IA qui se souviennent de chaque apprenant ».*

---

## 2. 🧰 Pré-requis pour filmer

Toute la stack doit tourner **avant** d'enregistrer (sinon les latences IA tuent le rythme) :

```bash
# 1. Infrastructure + microservices (identity, learning, agents, notifications, traefik)
cd upskilling_platform
cp .env.example .env          # renseigner POSTGRES_*, RABBITMQ_*, MINIO_*, SETUP_SECRET_KEY, OPENROUTER_API_KEY
docker compose up -d --build
docker compose ps             # tous les services doivent être "healthy"

# 2. Mémoire longue durée (Hindsight + embeddings + PG embarqué)
.\scripts\start-hindsight-local.ps1     # → http://127.0.0.1:8888

# 3. Agents IA (un terminal par agent)
cd agents/chat-coach   && pip install -e . && python -m app.run_agent_os_service   # :8012
cd agents/course-maker && pip install -e . && python -m app.run_agent_os_service   # :8010
cd agents/solo-challenge && pip install -e . && python -m app.run_agent_os_service # :8013
cd agents/learner-memory && pip install -e . && python -m app.run_agent_os_service # :8014
cd agents/course-memory  && pip install -e . && python -m app.run_agent_os_service # :8016

# 4. Frontend (Next.js)
cd upskilling_platform/frontend && npm install && npm run dev    # → http://localhost:3000
```

**Avant de filmer :**

- [ ] Base **réinitialisée** (`python clean_database.py` puis `python reset_setup.py`) → la démo montre le onboarding `/setup` depuis zéro.
- [ ] Un tenant **3S Group** prêt + un 2<sup>e</sup> tenant (ex. *Groupe Test*) pour la séquence 4 (isolation).
- [ ] Un cours **publié** avec au moins 3 leçons et un quiz (sinon la séquence 7 est vide).
- [ ] Les **clés API visibles à l'écran** sont masquées (`.env` fermé, pas de terminal ouvert sur les secrets).
- [ ] Un **compte apprenant** avec un historique (quiz raté, messages de coaching) → la mémoire a de la matière.
- [ ] Les agents répondent **avant** de filmer (2-3 essais) : on enchaîne les captures, on ne filme pas les temps morts.

---

## 3. 🎞️ Storyboard — version longue (9 min)

| Temps | Plan / écran | Voix off (à dire) | Brique technique |
| :--- | --- | --- | --- |
| **0:00 – 0:30** | Écran d'accueil de la plateforme : catalogue, cartes de cours, XP | *« Voici Open-MAIC Upskilling Platform : un LMS d'entreprise multi-tenant, où les cours sont générés par des agents IA et où chaque apprenant est coaché par un agent qui se souvient de lui. »* | Next.js 16 · React 19 · RBAC |
| **0:30 – 1:30** | `/setup` — les 6 étapes de l'assistant | *« Une plateforme neuve se configure en six étapes, derrière une clé secrète : SuperAdmin, identité de la plateforme, organisation, premier tenant. Une fois initialisée, la route `/setup` renvoie 410 — elle ne peut plus être rejouée. »* | `SETUP_SECRET_KEY` · provisioning |
| **1:30 – 2:30** | `/superadmin` — dashboard, tenants, admins, analytics, audit | *« Le SuperAdmin pilote la plateforme, mais n'a volontairement aucun accès aux données des employés : c'est du RGPD by design. Il gère les comptes Admin Tenant, les paramètres et l'audit global. »* | SuperAdmin · `SuperAdminAuditLog` |
| **2:30 – 3:10** | Terminal : `psql` → `SELECT * FROM users WHERE tenant_id = ...` pour 2 tenants | *« L'isolation est à double barrière : `tenant_id` est validé côté API, et surtout imposé par les politiques RLS de PostgreSQL. Même un `SELECT` direct ne peut pas traverser la frontière. »* | RLS · `app.current_tenant` |
| **3:10 – 4:00** | `/admin/users` — import CSV, rôle mapping, invitation, onboarding | *« L'Admin Tenant gère son équipe : import CSV, mapping de rôles, invitations, onboarding guidé. »* | FastAPI · SQLAlchemy · RabbitMQ |
| **4:00 – 5:20** | **Génération de cours** : on colle un sujet / dépose un PDF → outline → scènes → TTS → quiz → classe interactive | *« Le cœur du projet : un sujet ou un PDF devient un cours complet. Le pipeline OpenMAIC passe par un graphe d'agents — outline, scènes, actions, narration vocale, quiz — et le résultat arrive en streaming NDJSON, annulable à la volée. »* | Orchestration multi-agents · **Course Maker** · streaming |
| **5:20 – 6:10** | Côté apprenant : inscription, lecteur de leçon (slides / vidéo / texte), progression, XP, streak, badge | *« L'apprenant consomme le cours : progression, XP, niveaux, séries, badges et classement sont mis à jour en temps réel. »* | WebSocket · Redis · RabbitMQ |
| **6:10 – 7:20** | **Chat Coach** : une question → réponse en 5 champs ; puis une 2<sup>e</sup> question où l'agent **reprend** un détail dit avant | *« Le Chat Coach détecte l'intention et l'affect, enrichit le contexte en parallèle, puis ancre sa réponse dans les passages récupérés du cours. Et surtout : ce qu'il a appris de l'apprenant est retenu dans Hindsight — à la question suivante, il s'en souvient. »* | Agno (5 skills) · **Hindsight** `retain`/`recall`/`reflect` |
| **7:20 – 8:10** | Défi solo adaptatif + radar de lacunes + page `/verify/{certificateNumber}` avec le QR code | *« Le système mesure : défi solo construit depuis les quiz ratés, radar de compétences pour recommander les bons cours, et un certificat PDF signé dont le QR code pointe vers une page de vérification publique. »* | RAG · pgvector · certificats signés |
| **8:10 – 9:00** | Retour au README : section « Tests, performance et évaluation » (RAGAS + k6) puis la stack | *« Et ce n'est pas une maquette : la qualité des agents est mesurée avec RAGAS, la tenue en charge avec k6 — qui a révélé la vraie limite : au-delà de 3 utilisateurs simultanés, les agents IA saturent. Une limite que j'assume et que je documente. »* | RAGAS · k6 · CI/CD |

---

## 4. ⚡ Version courte (3 min) — pour un premier contact

| Temps | Séquence | Pourquoi celle-là |
| :--- | --- | --- |
| **0:00 – 0:20** | Séquence 1 (pitch + catalogue) | Poser le problème et la promesse en 2 phrases |
| **0:20 – 1:20** | Séquence 6 (génération de cours) | C'est la démo la plus spectaculaire : un sujet → un cours complet |
| **1:20 – 2:20** | Séquence 8 (coaching à mémoire) | C'est la preuve que l'IA est *ancrée* et *persistante*, pas un chatbot |
| **2:20 – 3:00** | Séquence 9 (mesure + certificat + limites k6) | Finir sur de la preuve chiffrée et sur l'honnêteté technique |

---

## 5. 🗣️ Script voix off (à lire tel quel)

> *« Open-MAIC est une plateforme de formation professionnelle pour entreprises. Elle est multi-tenant, c'est-à-dire qu'une seule installation sert plusieurs sociétés sans qu'aucune donnée ne puisse en sortir.*
>
> *Une plateforme neuve se configure en six minutes, derrière une clé secrète, et se verrouille ensuite.*
>
> *Un SuperAdmin pilote le groupe, sans jamais voir les données de ses employés.*
>
> *Et surtout : cette plateforme génère ses propres cours. On lui donne un sujet ou un document PDF ; un graphe d'agents coordonne la rédaction, la découpe en scènes, la narration vocale et le quiz. Le résultat s'affiche en streaming.*
>
> *L'apprenant suit son cours, et un agent le coache. Cet agent ne se contente pas de répondre : il retient ce que la personne a dit, ce qu'elle a raté, ce qui lui pose problème. À la question suivante, il s'en souvient.*
>
> *Cette mémoire est gérée par Hindsight, avec des banques séparées par cours, par apprenant, et par apprenant-cours.*
>
> *Enfin, le système mesure : il détecte les lacunes de compétences, propose le bon cours, et délivre un certificat signé dont le QR code est vérifiable publiquement.*
>
> *Ce projet a été développé seule, de la conception au déploiement, en cinq sprints, et il est évalué quantitativement : RAGAS pour la qualité pédagogique, k6 pour la charge. k6 a montré que les agents IA saturent au-delà de trois utilisateurs simultanés — c'est la prochaine étape de la roadmap. »*

---

## 6. 📋 Liste de contrôle avant / pendant / après

**Avant**
- [ ] Stack entière démarrée, aucun `docker compose ps` en rouge
- [ ] Base réinitialisée, `/setup` rejouable
- [ ] 2 tenants, 1 cours publié, 1 apprenant avec historique
- [ ] Résolution 1920×1080, onglet navigateur en plein écran, thème sombre
- [ ] Aucun secret visible (`.env`, headers `Authorization`, tokens JWT à l'écran)

**Pendant**
- [ ] Une seule prise par séquence, on coupe entre les séquences
- [ ] On laisse **2 secondes de blanc** avant de parler d'un nouvel écran (montage)
- [ ] Les requêtes IA sont filmées **en temps réel** : c'est un argument, pas un défaut

**Après**
- [ ] Export MP4 H.264, ~30 Mo maximum (qualité足以 pour GitHub / Drive)
- [ ] Vignette = première frame avec le titre du projet lisible
- [ ] Publication :
  - ✅ **Google Drive** (lien public « Anyone with the link ») → vignette cliquable dans le README
  - ✅ **Release GitHub** (`Releases → v1.0-demo → assets`) → lien CDN, plus stable que Drive
  - ✅ **YouTube (non répertoriée)** → lecteur intégré possible, mais la miniature Drive est plus simple
- [ ] Vérifier le README depuis le dépôt public : la vignette et le lien fonctionnent

---

## 7. 🖼️ Visuels de repli (sans vidéo)

Si la vidéo n'est pas accessible (blocage réseau, lecteur Drive), le README reste complet grâce aux visuels déjà versionnés :

| Visuel | Ce qu'il montre | Emplacement |
| --- | --- | --- |
| `assets/slides.gif` | Scènes de slides générées | `assets/` |
| `assets/quiz.gif` | Quiz interactif généré par IA | `assets/` |
| `assets/interactive.gif` | Scènes interactives (simulations, 3D, code) | `assets/` |
| `assets/pbl.gif` | Projet-based learning + MCP | `assets/` |
| `assets/discussion.gif` | Agent et apprenant en discussion | `assets/` |
| `upskilling_platform/e2e-testing/screenshot-*.png` | 30 captures du parcours `/setup` → dashboard SuperAdmin | `upskilling_platform/e2e-testing/` |

---

## 8. ❓ Questions probables du jury — et la démo y répond

| Question | Séquence de la démo qui y répond |
| --- | --- |
| « Comment vous garantissez l'isolation entre clients ? » | Séquence 3-4 (RLS + double validation API) |
| « L'IA peut-elle se tromper / halluciner ? » | Séquence 8 (réponse ancrée dans les passages) + RAGAS (faithfulness 0,643) |
| « La mémoire, c'est vraiment persistant ? » | Séquence 8 (le détail repris plus tard) |
| « Ça passe en production ? » | Séquence 9 + section « Tests, performance et évaluation » du README |
| « Vous avez trouvé la limite du système ? » | Séquence 9 (k6 : saturation des agents IA au-delà de 3 VU) |

---

## 9. 🔗 Références

- **README principal** → [`README.md`](./README.md)
- **Architecture détaillée** → section [🏗 Architecture](./README.md#-architecture)
- **Les agents IA** → section [🤖 Les agents IA](./README.md#-les-agents-ia)
- **Mémoire Hindsight** → section [🧠 Mémoire apprenant](./README.md#-mémoire-apprenant--hindsight)
- **Évaluation & charge** → section [🧪 Tests, performance et évaluation](./README.md#-tests-performance-et-évaluation)
- **Rapport de PFE** → [`Rapport_PFE_Aya_Telmoudi__Copy_/`](./Rapport_PFE_Aya_Telmoudi__Copy_/)

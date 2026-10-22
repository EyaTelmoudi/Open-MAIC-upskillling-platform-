<div align="center">

# 🎓 Open-MAIC — Upskilling Platform

### LMS d'entreprise multi-tenant · 7 agents IA autonomes · mémoire apprenant persistante

**Projet de fin d'études — Full-Stack & AI/GenAI Engineering**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.2-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Agno](https://img.shields.io/badge/Agno-AgentOS-FF6B35)](https://agno.com/)
[![Hindsight](https://img.shields.io/badge/Memory-Hindsight-6C63FF)](https://github.com/vectorize-io/hindsight)
[![RAGAS](https://img.shields.io/badge/Eval-RAGAS-8E44AD)](./eval/ragas-upskilling/)
[![k6](https://img.shields.io/badge/Load%20test-k6-7D64FF)](./upskilling_platform/performance/)

</div>

---

## 👋 Le projet en 30 secondes

> **Ce que c'est** — Une plateforme de formation professionnelle **B2B multi-tenant** qui **génère ses propres cours** avec des agents IA, **coache chaque apprenant** avec une **mémoire persistante**, mesure les compétences et délivre des certificats vérifiables.
>
> **Ce que ça démontre** — Un projet **full-stack de bout en bout** (Next.js / React / TypeScript · FastAPI / Python · PostgreSQL + pgvector · RabbitMQ · MinIO · Redis · Docker · Traefik · CI) **et** de l'**ingénierie IA/GenAI appliquée** (agents Agno, orchestration multi-agents, RAG, mémoire long terme, LLM-as-judge, évaluation RAGAS, tests de charge k6).
>
> **Statut** — Application fonctionnelle, déployée sur VM Linux, **évaluée quantitativement**, documentée (rapport PFE + 6 spécifications + 5 sprints + 28 commits de développement).

### 📊 Le projet en chiffres

| Développement | | Intelligence artificielle | |
| :--- | :--- | :--- | :--- |
| **~47 000** lignes de Python | code métier | **7** agents autonomes | Agno AgentOS |
| **~61 000** lignes de TypeScript | React / Next.js | **4** banques mémoire | `retain` / `recall` / `reflect` |
| **4** microservices | DDD, 4 bounded contexts | **36** routes API | + ~90 endpoints REST |
| **35** modèles SQLAlchemy | + RLS PostgreSQL | **5** pipelines IA | évalués RAGAS |
| **12** tenants modélisés | 3S Group | **~28** services | Docker / Traefik |

---

## 🎬 Démo vidéo

> ▶️ **[Voir la démo (MP4 — 30 Mo)](https://drive.google.com/file/d/1ZeWitpTY4NvPj-WZSoVN0C_LsmTcevwN/view?usp=drive_link)** · 📥 [Télécharger le MP4](https://drive.google.com/uc?export=download&id=1ZeWitpTY4NvPj-WZSoVN0C_LsmTcevwN) · 🎞️ [**Scénario détaillé de la démo**](./DEMO.md)

<a href="https://drive.google.com/file/d/1ZeWitpTY4NvPj-WZSoVN0C_LsmTcevwN/view?usp=drive_link">
  <img src="https://drive.google.com/thumbnail?id=1ZeWitpTY4NvPj-WZSoVN0C_LsmTcevwN&amp;sz=w1280" alt="Vignette de la démo — Open-MAIC Upskilling Platform" width="100%"/>
</a>

*Vignette de la démo — cliquez pour la lire dans Google Drive.*

### Ce que montre la démo

La démo suit un **parcours complet en 9 séquences** — du premier démarrage d'une plateforme vierge jusqu'au certificat vérifiable — en montrant à chaque étape la brique technique sous-jacente.

| # | Séquence | Ce qu'on voit à l'écran | La brique technique démontrée |
| :---: | --- | --- | --- |
| 1 | **Le pitch** | Catalogue, parcours, gamification, certificats | Multi-tenant · RBAC 7 rôles |
| 2 | **Démarrage vierge** | Assistant `/setup` en 6 étapes (clé secrète → SuperAdmin → plateforme → organisation → 1<sup>er</sup> tenant) | `SETUP_SECRET_KEY` · verrouillage **HTTP 410** |
| 3 | **Pilotage plateforme** | Dashboard SuperAdmin : tenants, admins, analytics, audit, paramètres | Cloisonnement **SuperAdmin ↔ Admin Tenant** (RGPD) |
| 4 | **Isolation** | Deux tenants, deux jeux de données, aucun chevauchement | `tenant_id` **API + RLS PostgreSQL** |
| 5 | **Équipe & contenu** | Import d'utilisateurs (CSV), mapping de rôles, invitation, onboarding, création de cours / modules / leçons / quiz | FastAPI + SQLAlchemy + MinIO (URLs signées) |
| 6 | **Génération de cours par IA** | Un sujet ou un PDF → outline → scènes → narration TTS → quiz → classe interactive, en **streaming NDJSON** | Pipeline OpenMAIC multi-agents · agent **Course Maker** |
| 7 | **Apprenant en action** | Inscription, lecteur de leçon (slides / vidéo / texte), progression, XP, niveau, streak, badges, classement | Streaming · WebSocket · RabbitMQ · Redis |
| 8 | **Coaching à mémoire** | Question → intention + affect → `recall` / `reflect` → réponse structurée en 5 champs ; l'agent **se souvient** d'un élément dit plus tôt | Agents Agno · **Hindsight** (`retain` / `recall` / `reflect`) |
| 9 | **Preuve & mesure** | Défi solo adaptatif, radar de lacunes, certificat PDF + QR code → `/verify/{certificateNumber}`, résultats RAGAS et k6 | RAG · pgvector · **RAGAS** · **k6** |

> 💡 **Version courte (3 min)** : séquences 1, 6, 8 et 9 — l'essentiel pour un premier contact.
> **Version longue (9 min)** : les 9 séquences — format 권u pour la soutenance.

📄 Le plan de tournage complet (voix off, minutage, liste de contrôle, commandes de lancement) est disponible dans **[`DEMO.md`](./DEMO.md)**.

---

## 📑 Table des matières

- [**Démo vidéo**](#-démo-vidéo) 🎬
- [**Compétences démontrées (mapping CV)**](#-compétences-démontrées-mapping-cv) ⭐
- [Réalisations techniques clés](#-réalisations-techniques-clés)
- [À propos du projet](#-à-propos-du-projet)
- [Fonctionnalités principales](#-fonctionnalités-principales)
- [Architecture](#-architecture)
- [Les agents IA](#-les-agents-ia)
- [Mémoire apprenant : Hindsight](#-mémoire-apprenant--hindsight)
- [Stack technique](#-stack-technique)
- [Structure du dépôt](#-structure-du-dépôt)
- [Prérequis](#-prérequis)
- [Installation et démarrage](#-installation-et-démarrage)
- [Variables d'environnement](#-variables-denvironnement)
- [Ports et URLs](#-ports-et-urls)
- [API](#-api)
- [Modèle de données](#-modèle-de-données)
- [Rôles et permissions](#-rôles-et-permissions)
- [Tests, performance et évaluation](#-tests-performance-et-évaluation)
- [Déploiement](#-déploiement)
- [Sécurité](#-sécurité)
- [Perspectives](#-perspectives)
- [Contribution](#-contribution)
- [Auteure](#-auteure)

---

## 💼 Compétences démontrées (mapping CV)

Chaque compétence ci-dessous est **réellement implémentée** dans ce dépôt — la colonne « Preuve » pointe vers le code ou les résultats qui la démontrent.

### 🌐 Full-Stack Engineering

| Compétence | Mise en œuvre concrète | Preuve |
| :--- | :--- | :--- |
| **Architecture frontend moderne** | Next.js 16 (App Router) + Next.js 15 sur la plateforme, React 19, Server/Client Components, streaming | `app/`, `upskilling_platform/frontend/src/app/` |
| **TypeScript avancé** | Typage strict de bout en bout, types partagés front/back, discriminated unions sur les états de jeu | `types/`, `frontend/src/types/` |
| **UI/UX & design system** | Tailwind CSS v4, Radix UI, Base UI, design system documenté (couleurs, rayons, typographie), shells par rôle | `upskilling_platform/UI-DESIGN-SYSTEM.md` |
| **State management** | Zustand (OpenMAIC) et React Context + hooks (plateforme), stores par domaine | `lib/store/`, `frontend/src/app/context/` |
| **API REST — conception & implémentation** | ~90 endpoints versionnés, routage par bounded context, pagination, filtres, codes HTTP sémantiques | `services/*/routers/` |
| **Temps réel** | WebSocket `ws/{user_id}`, rooms par utilisateur, consommateurs RabbitMQ | `services/notifications/` |
| **Authentification** | JWT HS256, refresh token, bcrypt, OIDC **Azure Entra ID**, auth locale admin, flux d'invitation | `services/identity/auth/` |
| **Autorisation** | RBAC hiérarchique (7 rôles), middleware `require_role`, double contrôle API + base | `middleware/rbac.py`, `db/migrations/001-rls-policies.sql` |
| **Modélisation de données** | 35 modèles SQLAlchemy, enums métier, migrations SQL ordonnées, contraintes d'intégrité | `packages/common/src/common/models.py` |
| **SQL avancé** | **Row-Level Security** PostgreSQL, index, CTE, agrégations analytiques, pgvector | `db/init/`, `db/migrations/` |
| **Microservices & DDD** | 4 services FastAPI autonomes, bounded contexts, package partagé, contrats explicites | `upskilling_platform/services/` |
| **Messagerie asynchrone** | RabbitMQ : 4 exchanges (topic + fanout), 9 queues, publication/consommation d'événements métier | `packages/common/src/common/messaging.py` |
| **Cache & performance** | Redis, TTL de contexte préparé, enrichissement parallèle (`asyncio.gather`) | `agents/chat-coach/app/` |
| **Stockage objet** | MinIO (S3), buckets préfixés par tenant, URLs présignées, proxy d'avatars | `frontend/src/app/lib/api.ts`, `services/learning/routers/content.py` |
| **Conteneurisation** | Dockerfiles multi-stage, Compose dev **et** prod, healthchecks, réseaux isolés | `Dockerfile`, `docker-compose*.yml` |
| **Reverse proxy & routage** | Traefik v3.1, `PathPrefix`, priorités, CORS, rate-limiting | `traefik-dynamic.yml` |
| **CI/CD** | GitHub Actions : lint, tests avec services (Postgres, RabbitMQ, MinIO), build matrix | `upskilling_platform/.github/workflows/ci.yml` |
| **Tests** | pytest, Vitest (29 suites), Playwright (E2E UI + setup), tests de sécurité | `tests/`, `e2e/`, `upskilling_platform/tests/` |
| **Qualité de code** | Prettier, ESLint, ruff, black, isort, conventions documentées | `.prettierrc`, `pyproject.toml`, `AGENTS.md` |

### 🤖 AI / GenAI Engineering

| Compétence | Mise en œuvre concrète | Preuve |
| :--- | :--- | :--- |
| **Intégration multi-LLM** | Abstraction providers (OpenAI, Anthropic, Google, DeepSeek, Qwen, Groq, Mistral, OpenRouter…), AI SDK v6, thinking budgets | `lib/ai/`, `configs/` |
| **Conception d'agents** | 7 agents Agno AgentOS indépendants : rôles, instructions, tools, schémas d'entrée/sortie Pydantic | `agents/*/app/` |
| **Orchestration multi-agents** | Graphe « director », génération outline → scènes → actions, LangGraph, workflows Agno | `lib/orchestration/`, `lib/generation/` |
| **Mémoire long terme** | Hindsight : `retain` / `recall` / `reflect`, banques par tenant / cours / utilisateur, déduplication de faits | `agents/*/app/*_memory*.py` |
| **RAG** | Chunking de cours, embeddings `bge-small-en-v1.5` (384 d), pgvector, recherche sémantique + expansion de graphe, reranking de passages | `agents/chat-coach/`, `agents/course-memory/` |
| **Grounding / anti-hallucination** | Réponses strictement ancrées dans les passages récupérés, scoring « grounded » du défi solo, citations de leçons | `agents/solo-challenge/`, `agents/ai-coaching-agent-2/` |
| **Prompt engineering** | Skills versionnées (`.md`), prompts par rôle, séparation intention / affect / synthèse / réponse | `agents/*/skills/` |
| **Sorties structurées** | JSON schemas Pydantic, parsing tolérant, validation, fallback déterministe | `agents/*/schemas/` |
| **Streaming** | Réponses NDJSON en flux (génération de cours), annulation d'exécution, reprise | `agents/course-maker/app/` |
| **LLM-as-judge & évaluation** | **RAGAS** : faithfulness, factual correctness, aspect critics, rubrics | `eval/ragas-upskilling/` |
| **Observabilité IA** | Métriques Prometheus Hindsight, suivi d'opérations asynchrones, latences par étape | `GET /metrics` |
| **Multimodalité** | TTS (Piper, OpenAI, Azure, Qwen, MiniMax, ElevenLabs, VoxCPM2), ASR Faster-Whisper, génération d'images, slides | `lib/audio/`, `speech-to-text-module/` |
| **Protocoles agents** | Serveur **MCP** (Model Context Protocol) exposé par Hindsight, tools MCP dans le PBL | `hindsight` `/mcp`, `lib/pbl/` |
| **Charge & coût des LLM** | Tests de charge k6 sur endpoints IA, identification du point de rupture (> 3 utilisateurs), benchmarks de latence | `upskilling_platform/performance/` |

### 🏗 Ingénierie logicielle

| Compétence | Mise en œuvre concrète |
| :--- | :--- |
| **Spécification avant code** | 6 spécifications fonctionnelles/techniques (SPEC-1 → SPEC-6) + 5 sprints chiffrés en story points |
| **Méthodologie** | AWS AI-DLC, framework GSD, sprints avec démos, mémoire projet maintenue dans `AGENTS.md` |
| **Documentation** | ~25 000 lignes de Markdown : specs, design system, rapport PFE, référence multi-tenant, ce README |
| **Revue de sécurité** | Audit documenté : secrets, CORS, JWT, RLS, SSRF guard, rate-limiting, en-têtes de sécurité |
| **Décisions d'architecture tracées** | Journal de sessions dans `AGENTS.md` (choix d'outils, arbitrages techniques, évolutions) |
| **Travail en autonomie** | Projet mené **seule**, de la conception au déploiement, en 5 sprints |

---

## 🏆 Réalisations techniques clés

1. **Mémoire apprenant à trois niveaux** — Conception d'une hiérarchie de banques Hindsight (`cours` / `apprenant` / `apprenant×cours` / `skill-profile`) avec extraction et **déduplication de faits durables**, injectée à chaque tour de coaching. C'est la brique qui distingue un vrai tuteur d'un chatbot.
2. **Génération de cours ancrée de bout en bout** — Depuis un PDF ou un sujet : parsing → outline → scènes → narrations → quiz → lecture interactive, avec orchestration multi-agents et **streaming NDJSON** annulable.
3. **Isolation multi-tenant à double barrière** — `tenant_id` validé côté API **et** imposé par **RLS PostgreSQL** ; SuperAdmin volontairement aveugle aux données employés (RGPD by design).
4. **Pipeline de coaching en temps réel** — Validation de contexte → cache Redis → **enrichissement parallèle** (intention, affect, synthèse) → `reflect` + `recall` → réponse structurée en 5 champs. Le tout avec repli déterministe si le LLM échoue.
5. **Évaluation quantitative plutôt qu'intuitive** — RAGAS pour la qualité pédagogique, k6 pour la charge : c'est ce qui a permis d'identifier le **vrai** goulot d'étranglement (agents IA > 3 utilisateurs) et de l'assumer dans la roadmap.
6. **Certificats vérifiables** — PDF signé + QR code + endpoint public de vérification + journal d'audit.
7. **Premier démarrage sécurisé** — Assistant `/setup` verrouillé par clé secrète, à usage unique, qui provisionne plateforme, groupe et premier tenant (puis répond 410).

---

## 🎯 À propos du projet

**Open-MAIC Upskilling Platform** est une plateforme de formation professionnelle (upskilling) et de mentorat destinée aux entreprises. Elle répond à un constat simple : dans les grands groupes, la formation interne est souvent générique, le mentorat ne passe pas à l'échelle, les parcours ne gardent aucune trace de l'apprenant, et la création de contenu reste lente et manuelle.

La plateforme combine trois briques :

1. **Un LMS d'entreprise complet et multi-tenant** — catalogue de cours, modules, leçons, quiz, progression, certificats vérifiables, gamification, équipes et objectifs.
2. **Un moteur de génération de cours multi-agents** issu d'**OpenMAIC** (*Open Multi-Agent Interactive Classroom*) — un cours peut être généré à partir d'un simple sujet ou d'un PDF, avec slides, narration TTS, quiz, simulations interactives et tableau blanc animé.
3. **Une couche d'agents IA spécialisés** (coaching, recommandation, défi solo, mémoire apprenant, mémoire cours) s'appuyant sur **Hindsight**, une mémoire longue durée de type humain (`retain` / `recall` / `reflect`).

### Contexte académique (PFE)

| Élément | Détail |
| --- | --- |
| **Titre du rapport** | *Plateforme de formation et de mentorat assistée par l'intelligence artificielle* |
| **Auteure** | Aya **TELMOUDI** |
| **École** | ENIS — École Nationale d'Ingénieurs de Sfax, Université de Sfax |
| **Département** | Génie informatique et mathématiques appliquées |
| **Entreprise d'accueil** | Standard Sharing Software (**3S Group**), Tunisie — fondée en 1988 |
| **Encadrante académique** | Sihem LOUKIL |
| **Encadrant industriel** | Hazem RAOUAFI |
| **Année universitaire** | 2025 / 2026 — soutenance le 20 juin 2026 |
| **Méthodologie** | AWS AI-DLC (2025) + framework **GSD** + Codex CLI, développement solo |

> 📄 Le rapport complet (LaTeX + PDF) est versionné dans [`Rapport_PFE_Aya_Telmoudi__Copy_/`](./Rapport_PFE_Aya_Telmoudi__Copy_/).

### Objectifs

- Centraliser la formation interne dans une plateforme **B2B** (pas d'auto-inscription).
- Fournir un **coaching IA contextuel** qui connaît l'historique de l'apprenant.
- **Automatiser la création de cours** à partir de documents d'entreprise.
- **Personnaliser les parcours** via analyse de lacunes de compétences.
- **Mémoriser durablement** les difficultés, préférences et acquis de chaque apprenant.
- Délivrer des **certificats vérifiables** (QR code + endpoint public).
- Isoler strictement les données de chaque entreprise (**multi-tenancy + RLS**).

---

## ✨ Fonctionnalités principales

### 🏢 Édition & gouvernance multi-tenant
- Hiérarchie **SuperAdmin → Admin Tenant → Manager / LearningExpert / TeamManager / TeamMember**.
- **Modèle de gouvernance à deux niveaux** : le SuperAdmin ne gère que les comptes *Admin Tenant* ; il n'a **aucun accès** aux données individuelles des employés (conformité RGPD). Chaque Admin Tenant gère ses propres utilisateurs.
- Isolation par `tenant_id` **imposée à double niveau** : middleware API + **Row-Level Security** PostgreSQL.
- **Assistant de premier démarrage** en 6 étapes (`/setup`) protégé par `SETUP_SECRET_KEY`, verrouillé une fois la plateforme initialisée.
- Limite de sièges par tenant (*seat limit*) avec alertes à 90 % et 100 %.

### 🎓 Apprentissage
- Catalogue de cours, modules, leçons (vidéo, texte, slides, SCORM-like).
- Inscription, progression (heartbeat vidéo et texte), reprise de lecture.
- Quiz et évaluations (choix unique/multiple, réponse courte) avec correction IA.
- Prévisualisation de cours par token, favoris (*bookmarks*), avis et notes.
- **Certificats PDF signés + QR code** et vérification publique sur `/verify/{certificateNumber}`.

### 🎮 Gamification
- Système **XP**, niveaux à courbe exponentielle, badges personnalisables avec paliers.
- **Séries (streaks)**, classements global/équipe/période, profil de progression.

### 👥 Social & objectifs
- **Équipes** (création, membres, activité, cours assignés, progression d'équipe).
- **Objectifs** individuels et d'équipe, suivi automatique.
- **Graphe de compétences** et analyse des lacunes (*skill gap*).

### 🤖 Intelligence artificielle
- **Génération de cours** à partir d'un PDF ou d'un sujet (pipeline OpenMAIC).
- **Chat Coach** contextuel avec détection d'intention, d'affect et de style d'apprentissage.
- **Défi solo** adaptatif généré à partir des quiz échoués et des difficultés réelles.
- **Recommandations** de cours priorisées par un radar de compétences.
- **Mémoire apprenant** persistante et **mémoire cours** consolidée.
- **Voice** : TTS (Piper, OpenAI, Azure, Qwen, MiniMax, ElevenLabs) et ASR (Faster-Whisper).

---

## 🏗 Architecture

Le dépôt contient **deux applications complémentaires** :

| Application | Rôle | Techno |
| --- | --- | --- |
| **`/` (racine)** | Moteur **OpenMAIC** : génération et lecture de classes interactives multi-agents | Next.js 16 (App Router) |
| **`/upskilling_platform`** | **Plateforme upskilling** : LMS multi-tenant, identité, gamification, agents | Next.js 15 + 4 microservices FastAPI |

### Vue d'ensemble

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENTS (navigateur)                          │
│   Apprenant · Admin Tenant · Team Manager · SuperAdmin · Expert      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  API GATEWAY — Traefik v3.1 (port 8000)                              │
│  Routage par préfixe · CORS · rate-limit (100 avg / 50 burst)        │
└───────────────────────────────┬──────────────────────────────────────┘
        ┌───────────────┬───────┴────────┬────────────────┐
        ▼               ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Identity    │ │  Learning    │ │   Agents     │ │Notifications │
│  & Access    │ │  Platform    │ │   Service    │ │  (WebSocket) │
│  :8001       │ │  :8002       │ │   :8003      │ │   :8004      │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │                │
       └────────────────┴────────┬───────┴────────────────┘
                                 ▼
        ┌────────────────────────────────────────────┐
        │            RabbitMQ (AMQP)                 │
        │  auth · learning · agents · notifications  │
        └────────────────────┬───────────────────────┘
                             ▼
   ┌──────────────┬──────────────┬──────────────┬──────────────┐
   │ PostgreSQL   │   MinIO      │    Redis     │   Hindsight  │
   │ + pgvector   │  (S3-like)   │  (cache)     │  (mémoire)   │
   │   :5433      │   :9000      │   :6379      │    :8888     │
   └──────────────┴──────────────┴──────────────┴──────┬───────┘
                                                       │
                          ┌────────────────────────────┴───────────────┐
                          ▼                                            ▼
              ┌───────────────────────────┐              ┌──────────────────────────┐
              │  7 agents Agno AgentOS    │              │  OpenMAIC (Next.js :3000)│
              │  8010 / 8012 / 8013 /     │◄────────────►│  génération & lecture    │
              │  8014 / 8015 / 8016       │              │  de classes multi-agents │
              └───────────────────────────┘              └──────────────────────────┘
```

### Les six couches (cf. rapport, chapitre Conception)

1. **Présentation** — Next.js + React + Tailwind, shells par rôle.
2. **API Gateway** — Traefik (routage, CORS, rate limiting).
3. **Microservices** — Identity, Learning, Agents, Notifications (DDD, 4 *bounded contexts*).
4. **Couche IA** — agents Agno + moteur de génération OpenMAIC.
5. **Couche mémoire** — Hindsight (banques vectorielles `pgvector`).
6. **Couche données** — PostgreSQL, MinIO, RabbitMQ, Redis.

### Microservices FastAPI

| Service | Port | Bounded context | Responsabilités |
| --- | --- | --- | --- |
| **Identity & Access** | `8001` | BC-1 | Auth locale + Azure Entra ID, JWT, RBAC, tenants, onboarding, SuperAdmin, audit, paramètres plateforme |
| **Learning Platform** | `8002` | BC-2 | Cours, modules, leçons, inscriptions, progression, quiz, certificats, gamification, équipes, objectifs, skill gap, upload MinIO |
| **Agents** | `8003` | BC-3 | Point d'entrée du domaine agents — les agents s'exécutent comme microservices dédiés (voir section [Les agents IA](#-les-agents-ia)) |
| **Notifications** | `8004` | BC-4 | `WS /ws/{user_id}`, consommateurs RabbitMQ (email/push/websocket) |

> ℹ️ Le routage est assuré par **Traefik v3.1** (en remplacement de l'ancien gateway FastAPI).

---

## 🤖 Les agents IA

Chaque agent est un **microservice Python indépendant** construit avec **FastAPI + Agno AgentOS**. Tous exposent `/health` et importent le package partagé `upskilling_platform/packages/common` (`common.models`, `common.auth`, `common.database`…).

| Agent | Port | Rôle | Routes principales |
| --- | --- | --- | --- |
| **Course Maker** | `8010` | Orchestration de la génération de cours via OpenMAIC (NDJSON streaming, annulation, raffinement) | `POST /v1/course-maker/generate`, `/refinement`, `/runs/{id}/cancel` |
| **Chat Coach** | `8012` | Pipeline de coaching complet : validation contexte, chargement Redis, enrichissement parallèle (intention, affect, synthèse), réponse ancrée (reflect/recall) | `POST /v1/chat-coach/ask`, `/prepared-context/start`, `/prepared-context/upsert-facts` |
| **Solo Challenge** | `8013` | Choisit un mode de défi adaptatif puis génère une question à partir du dernier quiz échoué ou de la mémoire cours | `POST /v1/solo-challenge/start` |
| **Learner Memory** | `8014` | Écrit les événements d'apprentissage dans la banque Hindsight de l'apprenant, extrait et déduplique des faits durables | `POST /v1/learner-memory/retain-lesson-event`, `/extract-discussion-facts` |
| **AI Coaching Agent 2** | `8015` | Réponse de coaching court : recall de la banque cours + reflect de la banque apprenant-cours | `POST /v1/ai-coaching-agent-2/ask` |
| **Course Memory** | `8016` | Assemble la connaissance complète d'un cours (leçons, quiz, sources), la nettoie et la retient dans la banque cours ; notifie via RabbitMQ | `POST /v1/course-memory/assemble`, `/delete` |
| **Recommendation** | `8016` | Radar de lacunes de compétences + flux de recommandations | `POST /v1/recommendation/skill-gap/start`, `/feed` |

> ℹ️ `course-memory` et `recommendation` utilisent le port `8016` par défaut : lancez celui dont vous avez besoin.

### Ce que fait concrètement chaque agent

- **Course Maker** ne contient pas de LLM : il relaie les requêtes vers le serveur OpenMAIC (multipart PDF ou formulaire) et streame la réponse en NDJSON. Il gère un store en mémoire pour l'annulation.
- **Chat Coach** est le plus riche : 5 *skills* Agno (`intent-finalizer`, `affect-detector`, `synthesis-parser`, `passage-ranker`, `coaching-response-composer`), un cache Redis de contexte préparé (`prepared_coaching_context:{id}`, TTL 900 s) et une réponse structurée `answer / why_this_matters / common_mistake / next_step / follow_up_prompts`.
- **Solo Challenge** s'appuie sur 5 skills (`solo-challenge-mode-selector`, `failed-quiz-reformulation`, `course-problem-signal`, `learner-reported-difficulty`, `general-course-reinforcement`) et persiste les tentatives en base (`solo_challenge_attempts`).
- **Learner Memory** gère 7 types d'événements : `lesson_completed`, `coaching_discussion_message`, `quiz_completed`, `solo_challenge_answered`, `video_progress_checkpoint`, `difficulty_signal_detected`, `course_enrollment_completed`.
- **Recommendation** produit un `skill_gap_radar` et un flux classé `high / medium / low priority`.

---

## 🧠 Mémoire apprenant : Hindsight

**Hindsight** (v0.5.6, *Agent Memory That Works Like Human Memory*) est un service externe qui expose une API REST + un serveur **MCP** sur `/mcp`. Il embarque PostgreSQL (`pg0`) avec `pgvector` et utilise des embeddings **`BAAI/bge-small-en-v1.5`** (384 dimensions).

> ℹ️ **Hindsight** est un service externe : il s'installe et se démarre séparément du dépôt. Le dossier `hindsight/` en contient la documentation. Démarrage local : `scripts/start-hindsight-local.ps1`.

### Les trois opérations

| Opération | Effet |
| --- | --- |
| **`retain`** | Écrit un souvenir (document + métadonnées + tags) dans une banque |
| **`recall`** | Recherche sémantique + expansion de graphe, retourne des faits |
| **`reflect`** | Synthèse raisonnée par le LLM sur la base des souvenirs |

### Convention de nommage des banques

```text
tenant:{tenantId}:course:{courseId}                     → connaissance du cours
tenant:{tenantId}:user:{userId}                         → profil général de l'apprenant
tenant:{tenantId}:user:{userId}:course:{courseId}       → vécu de l'apprenant sur un cours
tenant:{tenantId}:user:{userId}:skill-profile           → radar de compétences
```

### API Hindsight utilisée

```text
PUT    /v1/default/banks/{bank_id}                        créer / mettre à jour une banque
GET    /v1/default/banks/{bank_id}/profile                vérifier l'existence
POST   /v1/default/banks/{bank_id}/memories               retain (async → operation_id)
POST   /v1/default/banks/{bank_id}/memories/recall        recall
POST   /v1/default/banks/{bank_id}/reflect                reflect
GET    /v1/default/banks/{bank_id}/operations/{op_id}     suivi d'opération asynchrone
GET    /v1/default/banks/{bank_id}/documents              lister les documents
DELETE /v1/default/banks/{bank_id}/documents/{doc_id}     supprimer un document
DELETE /v1/default/banks/{bank_id}                        supprimer une banque
GET    /metrics                                           métriques Prometheus
```

### Intégrations mémoire par agent

| Agent | `retain` | `recall` | `reflect` |
| --- | --- | --- | --- |
| Chat Coach | difficultés détectées, messages | profil + banque cours/apprenant | réponse ancrée |
| Solo Challenge | tentatives, scores | difficultés de l'apprenant | sélection du mode + génération |
| AI Coaching 2 | message de coaching | faits du cours | réponse personnalisée |
| Learner Memory | événements d'apprentissage | — | extraction de faits |
| Course Memory | connaissance du cours | — | — |
| Recommendation | profil de compétences | banques `user:course:*` | radar + feed |

### Dépendances d'infrastructure Hindsight

- PostgreSQL embarqué `5544`
- Serveur d'embeddings **TEI** `8081`
- LLM via OpenRouter — modèle par défaut `openai/gpt-oss-120b:free`
- Redis `6379` (contexte préparé du Chat Coach / Learner Memory)

---

## 🛠 Stack technique

### Frontend

| Domaine | Technologie |
| --- | --- |
| Framework | **Next.js 16.1.2** (App Router) — racine / **Next.js 15.3.0** — `upskilling_platform/frontend` |
| UI | **React 19.2.3**, TypeScript 5, **Tailwind CSS v4**, Radix UI, Base UI, lucide-react |
| État | Zustand (OpenMAIC), React Context (plateforme) |
| Éditeur riche | ProseMirror |
| Graphiques | ECharts, Recharts |
| Export | pptxgenjs, mathml2omml, jsPDF, html2canvas |
| i18n | i18next / react-i18next |

### Backend

| Domaine | Technologie |
| --- | --- |
| API | **FastAPI** · **Python 3.12** · Uvicorn |
| ORM | SQLAlchemy + **pg8000** |
| Auth | JWT **HS256** (access 15 min) · **bcrypt** (12 rounds) · **Azure Entra ID** (OIDC/OAuth2) |
| Agents | **Agno AgentOS** (`agno >= 2.6.4`) · Pydantic v2 |
| LLM | OpenRouter (`openai/gpt-oss-120b:free`), fallback local `gemma-4-4b` |
| Orchestration cours | LangGraph, AI SDK v6 |
| Messagerie | **RabbitMQ** (RabbitMQClient maison, exchanges topic + fanout) |
| Cache | **Redis** |
| Stockage objet | **MinIO** (buckets préfixés par tenant) |

### Données & infra

| Domaine | Technologie |
| --- | --- |
| Base relationnelle | **PostgreSQL 16** + **pgvector** (`pgvector/pgvector:pg16`) |
| Mémoire vectorielle | **Hindsight** (`pg0` + `pgvector`) |
| Gateway | **Traefik v3.1** |
| Conteneurisation | **Docker** + **Docker Compose** (+ Kubernetes prévu) |
| TTS | **Piper** (conteneur), OpenAI, Azure, GLM, Qwen, MiniMax, ElevenLabs, VoxCPM2 |
| ASR | **Faster-Whisper** (`fedirz/faster-whisper-server`, port `8011`) |
| Génération d'images | ComfyUI (`8188`, optionnel), Seedream, Qwen-Image, Nano Banana, MiniMax, Grok |
| Tests | Vitest, Playwright, pytest, **k6**, RAGAS |
| Qualité | ESLint, Prettier, ruff, black, isort |

### Versions d'exécution

```text
Node.js  >= 20.9.0  (recommandé : 22, cf. .nvmrc)
pnpm     10.28.0
Python   >= 3.12
```

---

## 📂 Structure du dépôt

```text
Open-MAIC-upskillling-platform/
│
├── 📱 APPLICATION OPENMAIC (racine) ────────────────────────────────
├── app/                     # Next.js App Router
│   ├── page.tsx             # accueil
│   ├── classroom/[id]/      # lecteur de classe interactive
│   ├── generation-preview/  # prévisualisation de génération
│   ├── learing-expert-agent/# UI expert pédagogique
│   ├── learning-platform/   # visualisation de brouillons de cours
│   └── api/                 # 36 route handlers (voir section API)
├── lib/                     # cœur métier (29 sous-dossiers)
│   ├── ai/                  # clients LLM, providers, thinking
│   ├── generation/          # pipeline outline → scènes
│   ├── orchestration/       # director graph multi-agents
│   ├── playback/            # moteur de lecture
│   ├── action/              # moteur d'actions (21 types)
│   ├── media/               # image / vidéo / adaptateurs
│   ├── audio/               # TTS / ASR / voix
│   ├── export/              # PPTX, HTML, ZIP
│   ├── pbl/                 # project-based learning + MCP
│   ├── server/              # DB, MinIO, jobs, SSRF guard
│   └── store/               # stores Zustand
├── components/              # UI (stage, whiteboard, chat, renderers…)
├── packages/
│   ├── mathml2omml/         # MathML → OMML (LGPL-3.0)
│   └── pptxgenjs/           # génération PPTX (MIT)
├── configs/                 # constantes design (thème, polices, formes…)
├── eval/                    # évaluations (whiteboard, outline, ragas-upskilling)
├── e2e/                     # Playwright
├── tests/                   # Vitest (29 suites)
├── scripts/                 # i18n check, démarrage Hindsight
├── middleware.ts            # garde par code d'accès (HMAC)
├── next.config.ts
├── Dockerfile               # multi-stage node:22-alpine
├── docker-compose.yml       # redis + openmaic
│
├── 🏢 PLATEFORME UPSKILLING ───────────────────────────────────────
├── upskilling_platform/
│   ├── services/
│   │   ├── identity/        # BC-1 : auth, tenants, RBAC, onboarding
│   │   ├── learning/        # BC-2 : cours, progression, gamification
│   │   ├── agents/          # BC-3 : domaine agents
│   │   └── notifications/   # BC-4 : WebSocket + RabbitMQ
│   ├── packages/common/     # modèles, schémas, auth, DB, messaging, storage
│   ├── frontend/            # Next.js 15 (apprenant / admin / superadmin)
│   ├── db/
│   │   ├── init/            # 00-extensions … 06-users-migration
│   │   └── migrations/      # RLS, extensions system_config
│   ├── SPECS/               # SPEC-1 → SPEC-6
│   ├── SPRINTS/             # SPRINT-1 → SPRINT-5
│   ├── tests/               # unit / integration / security
│   ├── e2e-testing/         # Playwright (setup flow, 30 captures)
│   ├── performance/         # k6 + résultats
│   ├── piper/               # conteneur TTS Piper
│   ├── comfyui/             # conteneur génération d'images (optionnel)
│   ├── traefik-dynamic.yml
│   ├── docker-compose.yml       # stack dev
│   ├── docker-compose.prod.yml  # stack prod
│   ├── AGENTS.md            # mémoire projet (source de vérité)
│   ├── PLAN.md
│   └── UI-DESIGN-SYSTEM.md
│
├── 🤖 AGENTS IA ───────────────────────────────────────────────────
├── agents/
│   ├── ai-coaching-agent-2/ # :8015
│   ├── chat-coach/          # :8012
│   ├── course-maker/        # :8010
│   ├── course-memory/       # :8016
│   ├── learner-memory/      # :8014
│   ├── recommendation/      # :8016
│   └── solo-challenge/      # :8013
│
├── 🗣 MODULES ANNEXES ─────────────────────────────────────────────
├── speech-to-text-module/   # Faster-Whisper (hôte 8011 → conteneur 8000)
├── learing expert agent/    # artefacts de prototypage (outputs/ + drafts/)
├── test des performance des llm/  # mesure de latence LLM
├── skills/openmaic/         # skill OpenClaw (SOP de démarrage)
├── community/feishu.md      # QR code communauté Feishu
├── assets/
├── public/
│
├── 📄 Rapport PFE
├── Rapport_PFE_Aya_Telmoudi__Copy_/  # LaTeX + PDF (main.tex)
│
├── 3S_GROUP_TENANTS_REFERENCE.md  # 12 tenants 3S Group (slugs, domaines, couleurs)
├── CHANGELOG.md  · CONTRIBUTING.md  · SECURITY.md  · LICENSE (AGPL-3.0)
└── README-zh.md  · README.md (ce fichier)
```

---

## 📦 Prérequis

| Outil | Version minimale | Notes |
| --- | --- | --- |
| **Node.js** | 20.9.0 | 22 recommandé (`.nvmrc` = `22`) |
| **pnpm** | 10.28.0 | `corepack enable` ou `npm i -g pnpm@10.28.0` |
| **Python** | 3.12 | pour les microservices et les agents |
| **Docker** & **Docker Compose** | récents | toute la stack d'infra |
| **Git** | — | — |
| **Clé LLM** | — | OpenRouter, OpenAI, Anthropic, Google, Groq… au choix |

Ressources conseillées (cf. rapport) : **~8 vCPU, 15 Go RAM, ~23 Go disque**.

---

## 🚀 Installation et démarrage

> Le dépôt contient **deux stacks Docker distinctes**. Elles peuvent cohabiter mais **partagent le port 3000** : lancez-les sur des machines/hôtes différents ou remappez `FRONTEND_PORT`.

### 1️⃣ Cloner le dépôt

```bash
git clone https://github.com/EyaTelmoudi/Open-MAIC-upskillling-platform-.git
cd Open-MAIC-upskillling-platform
```

### 2️⃣ Option A — Stack **upskilling** complète (recommandé)

```bash
cd upskilling_platform

# 1. Configurer l'environnement
cp .env.example .env
# éditer .env : POSTGRES_* , RABBITMQ_* , MINIO_* , SETUP_SECRET_KEY , OPENROUTER_API_KEY …

# 2. Lancer l'infrastructure + services
docker compose up -d --build

# 3. Vérifier
docker compose ps
curl http://localhost:8001/health   # identity
curl http://localhost:8002/health   # learning
curl http://localhost:8000/health   # gateway (Traefik)
```

Accès :

| Interface | URL |
| --- | --- |
| Frontend | <http://localhost:3000> |
| Assistant de setup | <http://localhost:3000/setup> |
| Traefik dashboard | <http://localhost:8080> |
| RabbitMQ management | <http://localhost:15672> |
| MinIO console | <http://localhost:9001> |

> Premier lancement : ouvrez `/setup` et renseignez `SETUP_SECRET_KEY`, le compte SuperAdmin, la plateforme, l'organisation puis le premier tenant. Une fois terminé, les routes de setup renvoient **HTTP 410**.

### 3️⃣ Option B — Stack **OpenMAIC** (génération de cours)

```bash
# à la racine du dépôt
cp .env.example .env.local       # renseigner au moins un provider LLM
pnpm install
pnpm db:up        # PostgreSQL local si nécessaire (voir docs amont)
pnpm dev          # http://localhost:3000
```

Build de production :

```bash
pnpm build && pnpm start
# ou
docker compose up --build
```

Vérification santé :

```bash
curl -fsS http://localhost:3000/api/health
```

### 4️⃣ Lancer les agents IA (hors Docker Compose)

Hindsight doit tourner d'abord :

```powershell
# Windows
.\scripts\start-hindsight-local.ps1
# attendu : http://127.0.0.1:8888  (MCP sur /mcp)
```

Puis chaque agent dans son propre terminal :

```bash
cd agents/chat-coach
pip install -e .
python -m app.run_agent_os_service      # → 127.0.0.1:8012
```

| Agent | Commande de démarrage | Port |
| --- | --- | --- |
| course-maker | `cd agents/course-maker && python -m app.run_agent_os_service` | 8010 |
| chat-coach | `cd agents/chat-coach && python -m app.run_agent_os_service` | 8012 |
| solo-challenge | `cd agents/solo-challenge && python -m app.run_agent_os_service` | 8013 |
| learner-memory | `cd agents/learner-memory && python -m app.run_agent_os_service` | 8014 |
| ai-coaching-agent-2 | `cd agents/ai-coaching-agent-2 && python -m app.run_agent_os_service` | 8015 |
| course-memory | `cd agents/course-memory && python -m app.run_agent_os_service` | 8016 |
| recommendation | `cd agents/recommendation && python -m app.run_agent_os_service` | 8016 |

### 5️⃣ Service de transcription (optionnel)

```bash
cd speech-to-text-module
cp .env.example .env
docker compose up -d
# → http://localhost:8011  (POST /v1/audio/transcriptions)
```

### 6️⃣ Développement local sans Docker

```bash
# Backend — installer le package partagé EN PREMIER
cd upskilling_platform
pip install -e "packages/common[dev]"
cd services/identity && pip install -e .
uvicorn services.identity.main:app --reload --port 8001

# Frontend
cd frontend
npm install
npm run dev
```

> 💡 `DATABASE_URL_LOCAL` cible `localhost:5433` (PostgreSQL Docker) car un PostgreSQL local Windows occupe souvent `5432`.

---

## 🔐 Variables d'environnement

### Racine — `.env.example` (OpenMAIC)

Groupes documentés :

| Groupe | Variables |
| --- | --- |
| **LLM** | `OPENAI_*`, `ANTHROPIC_*`, `GOOGLE_*`, `DEEPSEEK_*`, `QWEN_*`, `KIMI_*`, `MINIMAX_*`, `GLM_*`, `SILICONFLOW_*`, `DOUBAO_*`, `OPENROUTER_*`, `GROK_*`, `TENCENT_*`, `XIAOMI_*`, `OLLAMA_*` |
| **TTS** | `TTS_OPENAI_*`, `TTS_AZURE_*`, `TTS_GLM_*`, `TTS_QWEN_*`, `TTS_MINIMAX_*`, `TTS_ELEVENLABS_*` |
| **ASR** | `ASR_OPENAI_*`, `ASR_QWEN_*` |
| **PDF** | `PDF_UNPDF_*`, `PDF_MINERU_*` |
| **Images** | `IMAGE_OPENAI_*`, `IMAGE_SEEDREAM_*`, `IMAGE_QWEN_IMAGE_*`, `IMAGE_NANO_BANANA_*`, `IMAGE_MINIMAX_*`, `IMAGE_GROK_*` |
| **Vidéos** | `VIDEO_SEEDANCE_*`, `VIDEO_KLING_*`, `VIDEO_VEO_*`, `VIDEO_SORA_*`, `VIDEO_MINIMAX_*`, `VIDEO_GROK_*` |
| **Divers** | `TAVILY_API_KEY`, `HTTP_PROXY`, `HTTPS_PROXY`, `DEFAULT_MODEL`, `LOG_LEVEL`, `ACCESS_CODE`, `ALLOW_LOCAL_NETWORKS`, `ALLOWED_FRAME_ANCESTORS` |

Chaque provider suit le schéma `{PROVIDER}_API_KEY` / `{PROVIDER}_BASE_URL` / `{PROVIDER}_MODELS`. Un fichier `server-providers.yml` optionnel peut remplacer les variables.

### Plateforme — `upskilling_platform/.env.example`

```dotenv
# PostgreSQL
POSTGRES_USER=upskilling
POSTGRES_PASSWORD=upskilling_dev_2026
POSTGRES_DB=upskilling_platform
DATABASE_URL=postgresql+pg8000://upskilling:upskilling_dev_2026@postgres:5432/upskilling_platform
DATABASE_URL_LOCAL=postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform

# RabbitMQ
RABBITMQ_USER=upskilling
RABBITMQ_PASSWORD=rabbitmq_dev_2026
RABBITMQ_URL=amqp://upskilling:rabbitmq_dev_2026@rabbitmq:5672/

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_SECURE=false

# Ports
GATEWAY_PORT=8000
FRONTEND_PORT=3000
IDENTITY_SERVICE_PORT=8001
LEARNING_SERVICE_PORT=8002
AGENTS_SERVICE_PORT=8003
NOTIFICATIONS_SERVICE_PORT=8004

# Application
ENVIRONMENT=development
LOG_LEVEL=debug
ALLOWED_ORIGINS=http://localhost:3000
PUBLIC_APP_URL=http://localhost:3000

# Setup (obligatoire au premier démarrage)
SETUP_SECRET_KEY=change-this-setup-secret-key-in-production

# Hindsight + LLM
HINDSIGHT_PORT=8888
HINDSIGHT_URL=http://hindsight:8888
HINDSIGHT_API_LLM_PROVIDER=openrouter
HINDSIGHT_API_LLM_MODEL=openai/gpt-oss-120b:free
OPENROUTER_API_KEY=
AI_COACHING_AGENT_2_URL=http://ai-coaching-agent-2:8015
```

> 🔧 **Variables d'environnement des agents** (à définir dans `.env`) : `COURSE_MAKER_AGENT_URL`, `CHAT_COACH_AGENT_URL`, `SOLO_CHALLENGE_AGENT_URL`, `LEARNER_MEMORY_AGENT_URL`, `AI_COACHING_AGENT_2_URL`, `RECOMMENDATION_AGENT_URL`, `COURSE_MEMORY_AGENT_URL`, `HINDSIGHT_URL`.

> 💡 `SETUP_SECRET_KEY` **doit** être défini : le service Identity refuse de démarrer sinon.

---

## 🌐 Ports et URLs

| Service | Port(s) | URL / notes |
| --- | --- | --- |
| Frontend upskilling | `3000` | <http://localhost:3000> |
| OpenMAIC (Next.js) | `3000` | <http://localhost:3000> — stack distincte, à remapper si cohabitation |
| Traefik | `8000` / `8080` | gateway + dashboard |
| Identity | `8001` | `/docs` FastAPI |
| Learning | `8002` | `/docs` FastAPI |
| Agents | `8003` | `expose` interne seulement |
| Notifications | `8004` | `ws://…/ws/{user_id}` |
| PostgreSQL | `5433` → `5432` | Docker ; `5432` = PG local Windows |
| RabbitMQ | `5672` / `15672` | AMQP / management |
| MinIO | `9000` / `9001` | API S3 / console |
| Redis | `6379` | cache contexte coaching |
| Hindsight | `8888` | REST + `/mcp` |
| Hindsight PostgreSQL | `5544` | `pg0` embarqué |
| TEI embeddings | `8081` | `BAAI/bge-small-en-v1.5` |
| Piper TTS | `5005` → `5000` | synthèse vocale |
| Faster-Whisper | `8011` → `8000` | transcription |
| ComfyUI | `8188` | images (non câblé) |
| Agent Course Maker | `8010` | génération via OpenMAIC |
| Agent Chat Coach | `8012` | coaching |
| Agent Solo Challenge | `8013` | défis |
| Agent Learner Memory | `8014` | mémoire apprenant |
| Agent AI Coaching 2 | `8015` | coaching court |
| Agent Course Memory | `8016` | mémoire cours |
| Agent Recommendation | `8016` | radar de lacunes + feed |

---

## 🔌 API

### OpenMAIC — `app/api/**` (36 route handlers)

| Domaine | Routes |
| --- | --- |
| **Accès** | `GET /api/access-code/status`, `POST /api/access-code/verify` |
| **Génération** | `POST /api/generate-classroom`, `GET /api/generate-classroom/[jobId]` |
| **Pipeline scènes** | `/api/generate/scene-outlines-stream`, `/scene-content`, `/scene-actions`, `/agent-profiles`, `/image`, `/video`, `/tts` |
| **Classe** | `GET/POST /api/classroom`, `GET /api/classroom-media/[classroomId]/[...path]` |
| **Expert pédagogique** | `POST /api/learing-expert-agent/generate`, `GET /api/learing-expert-agent/drafts`, `GET/PUT/POST/DELETE /drafts/[draftId]`, `POST …/approve-lesson`, `POST …/approve-scene`, `POST …/finalize`, `GET …/final-course`, `POST …/scenes/[sceneId]/revise`, `POST /runs/[runId]/cancel` |
| **Médias & entrées** | `POST /api/parse-pdf`, `/transcription`, `/proxy-media`, `/azure-voices`, `/web-search` |
| **Évaluation** | `POST /api/quiz-grade` |
| **Diagnostic** | `GET /api/server-providers`, `POST /api/verify-model`, `/verify-image-provider`, `/verify-pdf-provider`, `/verify-video-provider` |
| **Chat & PBL** | `POST /api/chat`, `POST /api/pbl/chat` |
| **Santé** | `GET /api/health` |

### Identity — `/api/v1`

```text
POST /api/v1/auth/login/local | /login/azure | /login/superadmin | /refresh | /set-password
GET  /api/v1/identity/users · GET /me · PUT /profile · POST /import (CSV) · GET /export
POST /api/v1/onboarding/step/{profile|skills|goals|recommendation} · POST /complete
     /api/v1/tenants/public
     /api/v1/superadmin/tenants · /admins · /dashboard/{stats|alerts|analytics}
     /api/v1/superadmin/settings/{general|security|notifications|ai}
     /api/v1/identity/audit-logs · /api/v1/sync/jobs
     /setup/{status|admin|platform|tenant|group|complete}   (hors /api/v1)
```

### Learning — `/api/v1`

```text
/courses          CRUD, publish, curriculum, memory-curriculum, learner-context
/modules /lessons CRUD
/enrollments      inscription (quota de sièges)
/progress         mise à jour, complétion, heartbeat vidéo/texte
/assessments      quiz, questions, soumission
/bookmarks /reviews /preview /certificates
/gamification     xp, level, streak, badges, leaderboard, profile
/goals /teams     objectifs et équipes
/skill-gap        graphe et lacunes
/content          upload MinIO + URLs signées
/ai-course-drafts brouillons de cours générés par IA
```

### Agents (exemples)

```http
POST /v1/chat-coach/ask
{ "tenantId": "...", "courseId": "...", "userId": "...",
  "question": "...", "sessionId": "...", "lessonId": "..." }

POST /v1/solo-challenge/start
{ "tenantId": "...", "userId": "...", "source": "learning-shell" }

POST /v1/recommendation/feed
{ "tenantId": "...", "userId": "...", "skillRadar": [...], "courses": [...],
  "enrollments": [...], "learnerContexts": [...] }

POST /v1/course-memory/assemble
{ "courseId": "...", "learningApiUrl": "...", "authToken": "...", "tenantId": "..." }
```

---

## 🗄 Modèle de données

**35 modèles SQLAlchemy** dans `upskilling_platform/packages/common/src/common/models.py`.

| Domaine | Entités |
| --- | --- |
| **Identité** | `User`, `Tenant`, `RoleMappingRule`, `IdentityAuditLog`, `SuperAdminAuditLog`, `SystemConfig` |
| **Contenu** | `Course`, `AICourseDraft`, `Module`, `Lesson`, `Assessment`, `Question`, `AssessmentAttempt`, `CoursePreviewToken` |
| **Apprentissage** | `Enrollment`, `UserProgress`, `LearnerCourseContext`, `CourseAssignment`, `Bookmark`, `CourseReview`, `Certificate`, `CertificateVerificationAudit` |
| **Gamification** | `XPTransaction`, `UserLevel`, `UserBadge`, `CustomBadge`, `UserStreak` |
| **Social** | `Team`, `TeamMembership`, `UserGoal`, `TeamGoal`, `Notification` |
| **Compétences** | `Skill`, `SkillEdge` |

### Énumérations clés

```text
UserRole      : SuperAdmin, Admin, Manager, LearningExpert, TeamManager, TeamMember, TeamIntern
UserStatus    : provisioned, pending_invitation, active, suspended, deleted
AuthProvider  : azure_entra, local
AgentType     : coaching, recommendation, gamification, coursemaker, librarian, skillgap
```

### Schéma initial

Les scripts `db/init/` s'exécutent dans l'ordre :

| Fichier | Rôle |
| --- | --- |
| `00-extensions.sql` | `vector` (pgvector) + `uuid-ossp` |
| `01-schema.sql` | Schéma cœur (users, tenants, cours, progression, XP, équipes, goals…) |
| `02-migrations-table.sql` | Table `schema_migrations` |
| `03-migration-0002.sql` / `0003.sql` | Évolutions incrémentales |
| `04-certificates-table.sql` | Certificats + audit de vérification |
| `05-system-config.sql` | Singleton `system_config` (setup, branding, JWT, Entra, agents…) |
| `06-users-migration.sql` | Colonnes utilisateurs (onboarding, Entra, invitations) |

Puis `db/migrations/` :
- `001-rls-policies.sql` — politiques **RLS** (contexte `app.current_tenant` + bypass SuperAdmin)
- `002-system-config-extensions.sql` — checklist SuperAdmin, branding groupe, `seat_limit`

### Scripts utilitaires (racine `upskilling_platform/`)

| Script | Effet |
| --- | --- |
| `check_database.py` | liste tables / colonnes / compteurs |
| `clean_database.py` | vide les données applicatives (garde le schéma) |
| `clear_users.py` | supprime tous les utilisateurs |
| `reset_setup.py` | remet `setup_completed=false` (relancer l'assistant) |
| `reinit_config.py` | réinitialise `system_config` |
| `add_columns.py` | ajoute les colonnes manquantes (idempotent) |
| `query_*.py` | inspection utilisateurs / config / global |
| `run_identity.py` | démarre Identity seul sur `8001` |

---

## 👤 Rôles et permissions

| Rôle | Périmètre | Peut |
| --- | --- | --- |
| **SuperAdmin** | Plateforme entière (`tenantId = null`) | Gérer les **Admins Tenant** uniquement, tenants, paramètres plateforme, audit global, analytics. **Aucun accès** aux employés. |
| **Admin** (Tenant Admin) | Son entreprise | Gérer ses utilisateurs, cours, équipes, objectifs, badges, identité (mapping rôles, révocation), audit tenant |
| **Manager** | Son équipe / département | Suivre la progression, assigner des cours |
| **LearningExpert** | Contenu | Créer/valider des cours via l'agent expert pédagogique |
| **TeamManager** | Une équipe | Gérer l'équipe, ses objectifs et badges |
| **TeamMember** | Personnel | Suivre ses cours, défis, objectifs, certificats |
| **TeamIntern** | Personnel (restreint) | Parcours d'apprentissage |

> 🔒 **Règle d'or** : le SuperAdmin est une identité **plateforme**, jamais un employé. Il ne s'authentifie **jamais** via Azure Entra ID (`authProvider = local`). Entra ID est configuré **par tenant**, pour ses employés.

---

## 🧪 Tests, performance et évaluation

### Tests automatisés

```bash
# OpenMAIC (racine)
pnpm test            # Vitest — 29 suites
pnpm test:e2e        # Playwright
pnpm lint            # ESLint
pnpm check           # Prettier
pnpm check:i18n-keys # cohérence des clés i18n

# Plateforme
cd upskilling_platform
pip install -e "packages/common[dev]"
pytest packages/common/tests/
pytest services/identity/tests/
pytest services/learning/tests/
pytest services/notifications/tests/
pytest tests/unit tests/integration tests/security
ruff check services/ packages/ && black --check services/ packages/
```

**Couverture** : tests unitaires (cours, auth, JWT, RBAC, import CSV, gamification, objectifs, équipes, skill gap), tests d'intégration (identity ↔ learning, ingestion de contenu, gateway), test de sécurité (non-exposition des réponses de quiz), E2E Playwright (catalogue → détail → lecteur, assistant de setup).

### Performance — k6

Résultats du **2026-06-09** (`upskilling_platform/performance/results/`, `grafana/k6:latest`) :

| Scénario | Charge | Erreurs | Latence |
| --- | --- | --- | --- |
| API cœur | 1 → 25 VU | **0 %** | moyenne 40,8 → 105,5 ms · p95 234,6 → 284,7 ms |
| Progression / gamification | 1 → 10 VU | **0 %** | p95 ≤ 361,6 ms |
| WebSocket notifications | jusqu'à 20 VU | **100 % connectés** | — |
| **Agents IA — 1 VU** | 1 | — | moyenne 2 988 ms · p95 7 885 ms |
| **Agents IA — 3 VU** | 3 | — | moyenne 6 519 ms · p95 19 501 ms |
| **Agents IA — 5 VU** | 5 | **26,67 %** | moyenne 9 447 ms · p95 ~30 000 ms |

**Lecture** : les endpoints classiques tiennent l'objectif `< 2 s`. Les endpoints IA **dégradent fortement au-delà de 3 utilisateurs simultanés** et commencent à échouer à 5 — c'est la principale limite de montée en charge du système.

Reproduire :

```bash
cd upskilling_platform/performance
docker run --rm -i grafana/k6 run - < k6_platform_performance.js \
  -e MODE=api -e VUS=10 -e DURATION=30s
```

### Évaluation RAGAS des agents

`eval/ragas-upskilling/` évalue les 5 modules IA avec les métriques `Faithfulness`, `FactualCorrectness(f1)`, `AspectCritic(pedagogical_usefulness)`, `AspectCritic(platform_alignment)` et `RubricsScore(overall_quality)`.

```bash
cd eval/ragas-upskilling
python run_ragas_eval.py    # nécessite OPENROUTER_API_KEY
```

Résultats versionnés (`ragas_results.md`, run du 2026-06-09, modèle `openai/gpt-oss-120b:free`, **5 échantillons**) :

| Métrique | Score |
| --- | --- |
| Faithfulness | **0,643** |
| Factual Correctness (f1) | **0,744** |
| Pedagogical Usefulness | **1,000** |
| Platform Alignment | **1,000** |
| Overall Quality (1–5) | **5,000** |

> ℹ️ Jeu de test de **5 échantillons** (1 par module IA) : cette évaluation est qualitative et destinée à être élargie pour une validation statistique.

### Benchmarks LLM

`test des performance des llm/measure_llm_response_time.py` mesure la latence de bout en bout d'un endpoint OpenAI-compatible :

```bash
python measure_llm_response_time.py \
  --base-url http://models.endpoint.3s.local \
  --model gemma-4-4b --prompt "Explique le RAG" --interactive
```

---

## 🚢 Déploiement

### Docker Compose — production

```bash
cd upskilling_platform
cp .env.example .env.prod
# renseigner les secrets, PUBLIC_APP_URL, domaines
APP_ENV_FILE=.env.prod docker compose -f docker-compose.prod.yml up -d --build
```

Différences avec le stack dev :
- Pas de publication de ports (identity/learning/agents/notifications/frontend en `expose` seulement).
- Traefik route tout par `PathPrefix` avec `priority=100`, frontend en catch-all.
- Variables `NEXT_PUBLIC_*` injectées au build depuis `PUBLIC_APP_URL`.
- Piper retiré.

### VM Linux (cf. rapport)

Déploiement sur une VM **8 vCPU / 15 Go RAM / ~23 Go disque**, via Docker Compose.

### Vercel (OpenMAIC uniquement)

`vercel.json` est fourni : framework `nextjs`, `pnpm install` / `pnpm build`, `maxDuration: 300` pour `app/api/**`.

### Kubernetes

Prévu dans la roadmap (cf. `AGENTS.md`), non implémenté.

---

## 🔒 Sécurité

### Mesures en place

- **JWT HS256**, access token **15 min**, refresh token, claims `sub / email / role / status / onboarded / tenantId`.
- **bcrypt** (12 rounds) — utilisé directement, pas via `passlib` (incompatibilité connue avec bcrypt ≥ 4).
- **RBAC** hiérarchique (middleware `require_role` / `require_min_role`).
- **RLS PostgreSQL** sur `tenant_id` + double validation API.
- **Setup protégé** par `SETUP_SECRET_KEY` puis verrouillé (HTTP 410).
- **Code d'accès OpenMAIC** : cookie `openmaic_access` signé HMAC-SHA256, middleware de garde.
- **SSRF guard** (`lib/server/ssrf-guard.ts`) + `proxy-fetch` pour les médias.
- En-têtes `X-Frame-Options` / CSP `frame-ancestors`, surchargeables via `ALLOWED_FRAME_ANCESTORS`.
- **Rate limiting** Traefik (100 req/s moyen, burst 50).
- Certificats : QR code + endpoint public de vérification + audit.

---

## 🔭 Perspectives

- **Déploiement unifié** : intégrer Hindsight et l'ensemble des agents dans un `docker-compose` unique (mise en route en une commande).
- **Passer à Kubernetes** avec autoscaling des agents IA pour absorber la montée en charge.
- **Évaluation IA continue** : jeu RAGAS élargi et suivi automatisé en CI.
- **Cache sémantique et batching** pour réduire encore la latence des agents.
- **Gestion centralisée des secrets** (Vault / secrets Kubernetes) et rotation automatisée.
- **Compléter l'i18n** et l'accessibilité (ARIA) sur les shells par rôle.
- **Tests de charge multi-tenant** (plusieurs tenants simultanés avec RLS).
- **Ouverture** à de nouveaux providers LLM, TTS et embeddings.

---

## 🤝 Contribution

Les conventions du projet sont documentées dans [`upskilling_platform/AGENTS.md`](./upskilling_platform/AGENTS.md) (source de vérité) et [`CONTRIBUTING.md`](./CONTRIBUTING.md).

```bash
# 1. Fork + branche
git checkout -b feat/ma-fonctionnalite

# 2. Développer & formater
pnpm format && pnpm lint
ruff check services/ packages/ && black services/ packages/

# 3. Tester
pnpm test && pytest

# 4. Commit (convention Keep a Changelog pour le CHANGELOG)
git commit -m "feat(learning): ajoute le suivi des objectifs d'équipe"

# 5. Pull Request
```

**Conventions** :
- Services : `services/{nom}/` · Routers : `services/{nom}/routers/`
- Modèles : `packages/common/src/common/models.py`
- Schémas : `services/{nom}/schemas/` · Enums : `packages/common/src/common/enums.py`
- Python : ruff + black (88 colonnes) · TS : Prettier + ESLint

---

## 👩‍💻 Auteure

**Aya TELMOUDI**
Élève-ingénieure — ENIS, Université de Sfax · Génie informatique et mathématiques appliquées
Stage de fin d'études chez **Standard Sharing Software (3S Group)**

- GitHub : [@EyaTelmoudi](https://github.com/EyaTelmoudi)
- Rapport PFE : [`Rapport_PFE_Aya_Telmoudi__Copy_/main.pdf`](./Rapport_PFE_Aya_Telmoudi__Copy_/main.pdf)

**Encadrement**
- Sihem LOUKIL — encadrante académique (ENIS)
- Hazem RAOUAFI — encadrant industriel (3S Group)

### 🧩 Mots-clés techniques

```text
Frontend   : Next.js · React · TypeScript · Tailwind CSS · Radix UI · Zustand · Socket.io
Backend    : Python · FastAPI · SQLAlchemy · Pydantic · REST · WebSocket · JWT · OAuth2/OIDC
Data       : PostgreSQL · pgvector · SQL · RLS · Redis · MinIO/S3 · RabbitMQ
IA / GenAI : LLM · agents (Agno, LangGraph) · RAG · embeddings · mémoire long terme (Hindsight)
             prompt engineering · sorties structurées · streaming · MCP · LLM-as-judge · RAGAS
Cloud/DevOps : Docker · Docker Compose · Traefik · GitHub Actions · Kubernetes (notions) · Vercel
Qualité    : pytest · Vitest · Playwright · k6 · ruff · black · ESLint · Prettier
```

> 💬 **En une phrase** : je conçois et livre des applications web complètes, et j'y intègre des agents LLM qui ont de la mémoire, des garde-fous et des métriques — pas seulement une démo.

---

<div align="center">

**⭐ Si ce projet vous est utile, laissez une étoile sur le dépôt !**

*Année universitaire 2025 / 2026 — Soutenance le 20 juin 2026*

</div>

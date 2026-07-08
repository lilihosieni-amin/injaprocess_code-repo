# PRD — Restaurant Process Documentation System (inja food)

| | |
|---|---|
| **Version** | 0.2 (draft, no technical detail) |
| **Date** | 2026-07-07 |
| **Status** | Ready for final review, before the ARD |
| **Product owner** | Dev team (single person) |
| **End user** | Process analyst (non-technical) |
| **Companion document** | ARD (architecture & technical design) — follows this document |

> This document defines only the "what and why." All the "where and how" (paths, names, data structures, tools, deployment) lives in the ARD.

---

## 1. Summary

The inja food restaurant is made up of several departments, and each department's work processes today exist only in staff members' heads and in in-person interviews. The goal of this system is to turn those interviews (audio) and their accompanying documents into a set of **structured, machine-readable processes** based on the **IDEF0 / IDEF3** standards, viewable and editable interactively.

The user — who has no technical background — must be able to upload voice notes and files, start processing, and view and correct the output, all without touching the server. The whole system is single-user and runs on a server.

---

## 2. Problem & Goal

**Problem.** The restaurant's process knowledge is scattered, verbal, and undocumented. Documenting it by hand with the IDEF standards is slow and requires expertise, and the primary user has neither the technical skills to work with a server nor a suitable tool.

**Goal.** A tool that turns audio interviews and documents into structured IDEF0/IDEF3 processes, with minimal friction for a non-technical user, in a reliable way that preserves change history, and with an interactive, editable output.

---

## 3. Users & Context

- **Primary user (process analyst):** conducts in-person interviews with department staff, records voice notes, and collects related documents. Non-technical; interacts only through Telegram and the UI.
- **Developer user:** the developer, who builds the system and gradually improves the extraction logic.
- **Context:** single-user, runs on a server, with full change history preserved. No need to "keep the user's device on," since everything is server-side.
- **Current departments (9):** management, accounting, warehouse, procurement, cooking, preparation, dining, cashier, logistics. The system must be **extensible** so that new departments (e.g. QC) can be added easily in the future.

---

## 4. Goals & Non-Goals

**Goals (v1):**
- Structured intake of voice notes and documents via Telegram.
- Processing voice into IDEF0/IDEF3 processes, which the user starts and steers via Telegram.
- An interactive UI for viewing/editing processes and sub-processes (developed alongside the rest).
- Full history of the output preserved.

**Non-Goals (v1):**
- Multi-user support, role management, or advanced authentication.
- PDF/Word output (the final output is intentionally interactive, not a static document).
- Automatic KPI generation or statistical analysis over processes.
- Support for other languages/restaurants.

---

## 5. v1 Scope

**In scope:** upload bot, control bot, process-extraction pipeline, the process/department content model, and the interactive UI — all four together.

**Out of scope:** anything under "Non-Goals"; and cost optimization (for now the strongest model is used for everything on purpose — see NFR).

---

## 6. System Overview

The system consists of five components that communicate **only through the shared data on the server**. Each one's role:

1. **Upload bot:** raw intake of voice/documents from the user and storing them on the server. No processing.
2. **Control bot:** the user starts processing and manages sessions via Telegram, with no technical work on the server.
3. **Extraction processing:** turns the voice into IDEF0/IDEF3 processes.
4. **Central data:** the system's source of truth; the output of every stage lives here and its history is preserved.
5. **Interactive UI:** viewing and editing processes, independent of the bots.

---

## 7. Functional Requirements (FR)

### 7.1 Upload Bot

- **FR-U1:** The user first chooses the upload type: voice or file.
- **FR-U2 (file path):** The user first selects one department (from the valid departments); this department applies to the **entire batch**. Then any number of files sent one after another belong to that same department (each file does not get a separate department). On "done," the bot shows the list of files with the single destination department, and on the user's confirmation stores them all. To upload to a different department, the user starts a new round.
- **FR-U3 (voice path):** The user first enters the meeting date, then selects the departments the voice is about (multiple allowed), then sends the voice, and the system stores it.
- **FR-U4 (deterministic naming):** The voice file's name is generated deterministically by the system (not by the language model), such that it is unique, non-colliding, and reflects the selected department(s) and the meeting date.
- **FR-U5:** After a successful upload, the bot gives the user a short, **copyable** identifier to paste into the control bot to start processing.
- **FR-U6:** The selected department must always be one of the system's valid departments.
- **FR-U7:** The file is held temporarily until the user's confirmation, and is only finalized after final confirmation.
- **FR-U8:** Any file/voice intake is only possible through this bot.

### 7.2 Control Bot

- **FR-C1:** The user pastes the voice identifier and asks to start processing.
- **FR-C2:** The user can create a new session and manage processing sessions.
- **FR-C3:** Any clarifying question from the system is raised conversationally in Telegram so the user can see and answer it.

### 7.3 Extraction Processing

- **FR-P1 (locate file):** As a first step, the system locates the voice matching the identifier; if there is no exact match, it asks conversationally and shows the closest options.
- **FR-P2 (transcription):** The system extracts and stores the voice's text. If the text of that same voice already exists, it does not redo the work.
- **FR-P3 (process identification):** The system identifies and separates the processes discussed in the text, and for each one detects one of three states: a new process, an update to an existing process, or **unchanged** (a process that was already extracted and about which the voice says nothing new).
- **FR-P4 (human approval before creation):** Before creating the processes, the list of identified processes and their new/update status is shown to the user in Telegram. The user confirms or corrects (e.g. a process was missed, or two processes should be merged). On a correction, only this identification is redone, and no output has been touched yet.
- **FR-P5 (process creation):** After confirmation, the system builds the IDEF0/IDEF3 structure for each process, or updates the existing process.
- **FR-P6 (department overview file):** At the end of each processing run, the department's overview file (including its sub-units, personnel, and their duties) is created or updated.
- **FR-P7 (history preservation):** Every successful processing run is recorded such that the change history and the reference to the voice and affected departments are preserved.
- **FR-P8 (multi-department voice):** If the voice relates to multiple departments, output is produced separately for each department.
- **FR-P9 (run retention):** The intermediate outputs of each run are kept permanently, to be used later for improving extraction quality.

### 7.4 Process Content Model

- **FR-D1 (readable, deterministic ID):** Every process and every part of it has a readable, unique identifier that is always generated by the system (not by the language model).
- **FR-D2 (unified ID generation):** IDs are always taken from a single source, regardless of whether the process was created via voice processing, via chat, or manually in the UI.
- **FR-D3 (process content):** Each process contains: an overall summary; process-level IDEF0 information (input, control, output, mechanism); key performance indicators (KPIs); and the process body as activity boxes, connections, and split/join junctions (AND/OR/XOR).
- **FR-D4 (per-box information):** Each box has a short title, a longer description (seen on click), the performer of the activity, and IDEF0 information where available.
- **FR-D5 (no fabrication):** Process and box information is filled only from the actual content of the voice; complete filling is not mandatory, and the system must not fabricate information to complete the template.
- **FR-D6 (sub-process):** A box can expand into a sub-process; the sub-process is itself a full process with a bidirectional link to its parent. The parent box's information boundary is kept in sync with its sub-process.
- **FR-D7 (sub-process creation):** Automatic, but only when a box is genuinely described with several distinct sub-steps. Automatically created sub-processes are flagged and reported to the user at the approval stage (without halting processing).
- **FR-D8 (deletion):** There is no automatic deletion. Seemingly removed items are only flagged. Deleting a parent box **orphans** the sub-process (not a cascade delete) and the user is warned.
- **FR-D9 (flowchart layout):** The positions of flowchart parts are saved so the user's edits are preserved. The initial layout is horizontal and left-to-right, and for long flows it wraps **serpentine-style** across multiple rows so it does not overflow the page width.
- **FR-D10 (layout during updates):** The user's manual repositioning is preserved. Adding a new part at the end of the process is only an append; inserting a part in the middle triggers a **local** re-layout (from the insertion point onward) that preserves the upstream part, and this re-layout is reported to the user. The UI also offers a full "re-layout" option.
- **FR-D11 (source tracking):** For each part it is recorded which voice/run it came from and which ones changed it.

### 7.5 Update & Conflict

- **FR-M1 (new / update / unchanged):** The system proposes one of three states for each process, and the human makes the final decision. An "unchanged" process is neither created nor edited and is only reported as "already covered" (with a lightweight record that this voice also referenced it); if the user is unsure, they can convert it to "update" right there. (The main mechanism for preventing duplicate processes and unnecessary work.)
- **FR-M2 (preserving existing output):** When updating an existing process, the IDs and layout of existing parts are preserved and only the necessary changes are applied.
- **FR-M3 (conflict policy):** Empty fields and new items are filled automatically; but wherever the voice would change a value that is **already filled** (perhaps the user's manual edit), instead of overwriting, that change is recorded as a "pending proposal" and the original value is left untouched.
- **FR-M4 (conflict review):** Conflicts are not asked about mid-processing (processing is not blocked). At the end of each work cycle, the system shows the user the **list of conflicts** (not just their count) in Telegram so they are informed, and the user can resolve them right there in chat if they wish. Independently, all conflicts also remain available in the **UI review inbox** — showing "current value vs. proposal" with accept/reject — to be handled there whenever the user wants. In both paths, the original value stays untouched until the user decides.

### 7.6 UI

- **FR-I1:** The UI is independent of the bots and works from the same central system data.
- **FR-I2 (navigation):** Clicking a department name → the list of its processes; clicking a process → its flowchart; clicking a sub-process → the sub-process flowchart; clicking a box → its further details; and a process summary card (overall info and KPIs) before entering the boxes.
- **FR-I3 (view & edit):** The UI's default mode is **view-only**; the user sees processes and flowcharts without anything being accidentally changeable. Only by pressing the **"Edit"** button does the editor open and the user can edit/delete/add and reposition parts. Changes are written only when the user presses **"Save"** (not automatically on every change).
- **FR-I4 (review inbox):** Conflicts are shown with a diff and accept/reject buttons, and the user's decision is saved.
- **FR-I5 (manual creation):** The user can manually create a new process for a department; the system assigns an ID and the process is built with the standard structure from the start.

---

## 8. User Flows

**Main flow (extraction):** The user records the meeting ← in the upload bot enters the date and departments and sends the voice ← takes the copyable identifier ← pastes it into the control bot and says "process" ← the system identifies the processes and shows the list for approval ← the user confirms/corrects ← the system builds the processes and the changes are recorded ← the user opens the department in the UI, views the flowcharts, edits as needed, and resolves conflicts.

**Secondary flow (manual creation):** The user creates a new process for a department in the UI (or via chat); the system assigns an ID; the next voice that touches that same process is linked to this existing process.

---

## 9. Non-Functional Requirements (NFR)

- **NFR-1 (Telegram access):** Only registered Telegram IDs (for now, only the primary user) are allowed to use either bot; others are silently rejected.
- **NFR-2 (large audio files):** The system must be able to receive and process large meeting audio files (which are usually large) without issue.
- **NFR-3 (UI auth without a database):** UI login is protected by a username and password, with no database required. The password is stored securely, not in plaintext.
- **NFR-4 (model):** All processing uses the strongest model (Opus 4.8), even for simple tasks. This is a quality-driven choice and can be changed later.
- **NFR-5 (time & budget):** The time and cost budget for processing must be set to match the multi-stage, high-cost nature of each run.
- **NFR-6 (robustness on large voices):** Processing must not fail due to the model's memory limits on long voices; the system must handle large voices without data loss.
- **NFR-7 (history & backup):** All changes — from any path (voice processing, chat, or UI) — are recorded in the history, and no change goes unrecorded. In addition, an off-site backup is taken **twice a day** (11am and 11pm, only if there is a new change).
- **NFR-8 (extensibility):** Adding a new department must be simple and must not change the system's logic.
- **NFR-9 (service durability):** The bots must run as permanent, durable services on the server.
- **NFR-10 (output integrity):** Every structured output the system produces conforms to the system's fixed data contract; a nonconforming output is detected and corrected before anything relies on it.

---

## 10. Product Invariants

Non-negotiable rules that must always hold:

- **INV-1:** No identifier is ever created by the language model; IDs are always generated by the system, uniquely, from a single source.
- **INV-2 (code/data separation):** At runtime, the extraction logic cannot change the application code or its own configuration; it only produces/edits data. Changing the logic is possible only at development time.
- **INV-3 (no fabrication):** Extraction information is filled only from the actual content of the voice.
- **INV-4 (no automatic deletion):** Deletion is only manual and with user confirmation; the system merely flags.
- **INV-5 (human approval):** The list of processes is confirmed by a human before creation, and existing values are not changed without human approval.

---

## 11. Acceptance Criteria

- **AC-1:** Uploading a large voice from Telegram succeeds and the file is stored on the server.
- **AC-2:** When processing is started from the control bot, the system reaches the approval stage, and after the user's confirmation, valid IDEF0/IDEF3 processes are produced and recorded.
- **AC-3:** Re-processing the same voice does not create rework, extra cost, or a duplicate process.
- **AC-4:** A multi-department voice produces the correct output separately for each department.
- **AC-5:** Repositioning flowchart parts in the UI is preserved after reopening, and the next voice does not break the user's manual layout.
- **AC-6:** A value conflict is recorded as a "pending proposal" and is resolvable in the UI review inbox with accept/reject, without the original value being changed automatically.
- **AC-7:** At runtime, the extraction logic cannot change the code or its own configuration.
- **AC-8:** An unauthorized Telegram ID cannot use the bots, and the UI does not open without the correct username/password.

---

## 12. Open Items & Future

- Adding new departments (QC, etc.) — the mechanism is ready, each department's content comes later.
- Fine-tuning the threshold for automatic sub-process creation based on stored runs.
- Cost optimization with cheaper models for lightweight stages (for now, all Opus 4.8 on purpose).
- Filling in KPIs (which are usually not stated in a process-description interview) via a separate question or manual entry.

---

## 13. Deferred to the ARD

These technical topics are intentionally excluded from the PRD and appear in the ARD: folder structure and naming; the exact process data structure; the design of the processing and its technical components; how the ordering of stages is guaranteed; the separation of the code and data environments and how development is done; the layout algorithm; the authentication and access mechanism; and how the services are deployed on the server.

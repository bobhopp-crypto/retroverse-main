# RetroVerse System Overview  
Version 1.0

## Purpose  
RetroVerse is a modular, data-driven entertainment platform designed to merge historical chart data, curated music video metadata, and interactive game experiences into a unified web environment. This document provides a high-level conceptual and technical overview of the entire system.

---

## 1. Architectural Layers

RetroVerse is organized into three major layers, each with strict boundaries:

### **A. Data Sources Layer**
This is the authoritative truth for all chart-related and song-related metadata in RetroVerse.  
It contains:

- **Billboard API / Chart Provider (external)**  
- **Data Ingestion Script (internal)**  
- **song-registry.json (internal, canonical)**  
- **Chart Data Store (derived)**  

Characteristics:
- Immutable past data  
- Append-only ingestion  
- Decoupled from UI or game logic  

---

### **B. Game Logic Layer**
The brains of the system.  
This layer contains independent engines that all consume the same standardized data structures:

- **Hit Parade Engine**  
- **Name That Year Engine**  
- **Song Journey Engine**  
- **Wayback Console Core**  

Responsibilities:
- Deterministic gameplay  
- Difficulty balancing  
- Session tracking and scoring  
- Data lookup against song-registry.json and chart store  

This layer **never** displays UI directly.  
It only returns structured game states and events.

---

### **C. Presentation Layer**
This is everything the user sees:

- Wayback Console UI  
- Sub-page UIs for individual games  
- Input controls  
- Video Player component  

This layer never mutates data sources and does not embed business logic.  
It receives **ready-made game states** from Game Logic engines.

---

## 2. Video Playback Bridge

RetroVerse does *not* talk directly to the Video Library system.  
Instead, all interactions pass through a thin, stable abstraction:

### **video-index.json**
A compact lookup file containing:
- Title  
- Artist  
- Year  
- songId  
- videoId  
- playback URL  
- thumbnail path  

### **Video Lookup Service**
Consumes video-index.json and returns:
- canonical video metadata  
- resolution of ambiguous matches  
- the final playback URL  

This prevents any coupling to the Video Library’s internal structure.

---

## 3. System Data Flow Summary

1. Data ingestion pulls chart data → builds song-registry.json  
2. Game engines consume registry + chart data  
3. Presentation layer requests game state updates  
4. When video playback is required:  
   - UI → Video Lookup Service → Video Library System  

This creates a clean, stable, maintainable architecture with very few cross-layer dependencies.

---

## 4. Design Goals

- **Reliability**: deterministic results regardless of dataset size  
- **Extensibility**: new game engines can be dropped in using shared schemas  
- **Decoupling**: Video Library remains a black box  
- **Performance**: static JSON + client-side logic enables fast load times  
- **Longevity**: architecture should survive redesigns without breakage  

---

## 5. Glossary

**Registry Entry** — the canonical internal representation of a song  
**Chart Record** — the week-by-week performance of a song  
**Game Engine** — standalone logic module producing game states  
**Video Index** — lookup table bridging songs → videos  
**Playback Bridge** — service that resolves video metadata for UI  

---

End of document.

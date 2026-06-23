# User Interface System

<cite>
**Referenced Files in This Document**
- [WizardUI.js](file://src/ui/WizardUI.js)
- [UploadStep.js](file://src/ui/UploadStep.js)
- [MaskStep.js](file://src/ui/MaskStep.js)
- [RigStep.js](file://src/ui/RigStep.js)
- [StageStep.js](file://src/ui/StageStep.js)
- [ExportPanel.js](file://src/ui/ExportPanel.js)
- [SaveLoadPanel.js](file://src/ui/SaveLoadPanel.js)
- [SettingsPanel.js](file://src/ui/SettingsPanel.js)
- [StateMachine.js](file://src/state/StateMachine.js)
- [App.js](file://src/App.js)
- [main.js](file://src/main.js)
- [style.css](file://src/style.css)
- [index.html](file://index.html)
- [toast.js](file://src/ui/toast.js)
- [characterData.js](file://src/types/characterData.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the User Interface System for PaperAlive, focusing on the wizard-based workflow and component architecture. It explains the WizardUI foundation, the four-step wizard (Upload, Mask, Rig, Stage), and supporting panels (Export, Save/Load, Settings). It documents component lifecycle management, state synchronization with the StateMachine, data binding patterns, event handling, form validation, keyboard shortcuts, accessibility, responsive design, and integration with the state management system. Practical examples illustrate UI composition, validation, and export/save/load functionality.

## Project Structure
PaperAlive’s UI is organized around a root application component that owns the state machine and orchestrates step components. Styles are centralized in a single stylesheet with responsive breakpoints. The wizard container renders step indicators and hosts step components dynamically.

```mermaid
graph TB
subgraph "Entry Point"
HTML["index.html"]
MAIN["main.js"]
end
subgraph "Application Layer"
APP["App.js"]
SM["StateMachine.js"]
WIZARD["WizardUI.js"]
end
subgraph "Steps"
UPLOAD["UploadStep.js"]
MASK["MaskStep.js"]
RIG["RigStep.js"]
STAGE["StageStep.js"]
end
subgraph "Panels"
EXPORT["ExportPanel.js"]
SAVELOAD["SaveLoadPanel.js"]
SETTINGS["SettingsPanel.js"]
end
subgraph "Shared"
TYPES["characterData.js"]
STYLE["style.css"]
TOAST["toast.js"]
end
HTML --> MAIN --> APP
APP --> SM
APP --> WIZARD
APP --> UPLOAD
APP --> MASK
APP --> RIG
APP --> STAGE
STAGE --> EXPORT
STAGE --> SETTINGS
APP --> SAVELOAD
APP --> TOAST
APP --> STYLE
SM --> TYPES
```

**Diagram sources**
- [index.html](file://index.html)
- [main.js](file://src/main.js)
- [App.js](file://src/App.js)
- [StateMachine.js](file://src/state/StateMachine.js)
- [WizardUI.js](file://src/ui/WizardUI.js)
- [UploadStep.js](file://src/ui/UploadStep.js)
- [MaskStep.js](file://src/ui/MaskStep.js)
- [RigStep.js](file://src/ui/RigStep.js)
- [StageStep.js](file://src/ui/StageStep.js)
- [ExportPanel.js](file://src/ui/ExportPanel.js)
- [SaveLoadPanel.js](file://src/ui/SaveLoadPanel.js)
- [SettingsPanel.js](file://src/ui/SettingsPanel.js)
- [characterData.js](file://src/types/characterData.js)
- [style.css](file://src/style.css)
- [toast.js](file://src/ui/toast.js)

**Section sources**
- [index.html](file://index.html)
- [main.js](file://src/main.js)
- [App.js](file://src/App.js)
- [style.css](file://src/style.css)

## Core Components
- WizardUI: Container for the 4-step wizard with step indicator and dynamic content area. Manages step activation, progress display, and lifecycle.
- UploadStep: Drag-and-drop, file picker, clipboard paste, and “Load from Storage” UI for image input.
- MaskStep: Threshold slider, brush tools, undo/redo, and mask preview with keyboard shortcuts.
- RigStep: Character type selector, joint estimation, joint editing with undo/redo, and “Bring to Life” action.
- StageStep: WebGL rendering, motion playback, IK dragging, export panel, and keyboard shortcuts.
- ExportPanel: Recording controls with timer overlay and codec detection.
- SaveLoadPanel: Character name input, save to browser storage, and load from storage.
- SettingsPanel: NPR rendering parameter controls with reset to defaults.
- StateMachine: Centralized state machine governing transitions, guards, shared state, and undo/redo routing.
- App: Root component wiring steps, panels, keyboard shortcuts, and lifecycle hooks.

**Section sources**
- [WizardUI.js](file://src/ui/WizardUI.js)
- [UploadStep.js](file://src/ui/UploadStep.js)
- [MaskStep.js](file://src/ui/MaskStep.js)
- [RigStep.js](file://src/ui/RigStep.js)
- [StageStep.js](file://src/ui/StageStep.js)
- [ExportPanel.js](file://src/ui/ExportPanel.js)
- [SaveLoadPanel.js](file://src/ui/SaveLoadPanel.js)
- [SettingsPanel.js](file://src/ui/SettingsPanel.js)
- [StateMachine.js](file://src/state/StateMachine.js)
- [App.js](file://src/App.js)

## Architecture Overview
The wizard-based UI follows a state-driven architecture:
- App initializes WizardUI and registers state machine listeners.
- WizardUI updates step indicators and hosts the active step component.
- Steps communicate via callbacks to update shared state in StateMachine.
- Guards validate transitions; lifecycle hooks manage initialization and cleanup.
- StageStep integrates rendering, motion, and export panels.

```mermaid
sequenceDiagram
participant User as "User"
participant App as "App.js"
participant SM as "StateMachine.js"
participant Wizard as "WizardUI.js"
participant Step as "Active Step Component"
User->>App : Interact (upload/mask/rig/keyboard)
App->>SM : transition(event, data)
SM->>SM : guard check
SM->>App : emit("stateChanged", info)
App->>Wizard : updateState(newState)
App->>Wizard : getContentContainer()
App->>Step : destroy() previous step
App->>Step : mount() new step
Step-->>App : callbacks (onNext/onBack/onMaskChange/etc.)
App->>SM : update shared state (alphaMask, jointPositions, etc.)
```

**Diagram sources**
- [App.js](file://src/App.js)
- [StateMachine.js](file://src/state/StateMachine.js)
- [WizardUI.js](file://src/ui/WizardUI.js)

## Detailed Component Analysis

### WizardUI Foundation
WizardUI creates a step indicator and a content area. It manages:
- Step indicator highlighting (active/completed).
- Content container for mounting step components.
- Progress display for preprocessing state.
- Active step lifecycle (destroy previous step before mounting new).

```mermaid
classDiagram
class WizardUI {
-_container : HTMLElement
-_el : HTMLElement?
-_stepContainer : HTMLElement?
-_indicatorEl : HTMLElement?
-_contentEl : HTMLElement?
-_activeStepComponent : any
-_currentState : string
+constructor(container)
+mount()
+updateState(currentState)
+getContentContainer() : HTMLElement?
+setActiveStep(stepComponent)
+showProgress(label, progress)
+destroy()
-_updateIndicator()
}
```

**Diagram sources**
- [WizardUI.js](file://src/ui/WizardUI.js)

**Section sources**
- [WizardUI.js](file://src/ui/WizardUI.js)

### UploadStep: Image Input and Validation
UploadStep provides:
- Drag-and-drop zone with hover feedback.
- File picker and paste-from-clipboard handling.
- Validation for file size and type.
- Optional “Load from Storage” button when saved character exists.
- Callbacks for successful image load and storage load.

```mermaid
flowchart TD
Start(["User drops/chooses image"]) --> ValidateSize["Validate file size ≤ 10MB"]
ValidateSize --> SizeOK{"Size OK?"}
SizeOK --> |No| ToastError["toast('error', 'Too large')"]
SizeOK --> |Yes| ValidateType["Validate MIME type"]
ValidateType --> TypeOK{"Type supported?"}
TypeOK --> |No| ToastError
TypeOK --> |Yes| LoadImage["loadImage(file)"]
LoadImage --> OnSuccess{"Loaded?"}
OnSuccess --> |Yes| Callback["onImageLoaded(loadedImage)"]
OnSuccess --> |No| ToastError
ToastError --> End(["End"])
Callback --> End
```

**Diagram sources**
- [UploadStep.js](file://src/ui/UploadStep.js)
- [toast.js](file://src/ui/toast.js)

**Section sources**
- [UploadStep.js](file://src/ui/UploadStep.js)
- [toast.js](file://src/ui/toast.js)

### MaskStep: Threshold, Brush, Undo/Redo, Preview
MaskStep manages:
- Threshold slider to generate initial mask.
- Brush tools (add/erase modes) with configurable radius.
- Canvas overlay blending for mask visualization.
- History-based undo/redo with keyboard shortcuts (Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y).
- Navigation to next step with guard validation.

```mermaid
sequenceDiagram
participant User as "User"
participant Mask as "MaskStep.js"
participant History as "MaskHistory"
participant Renderer as "Canvas Renderer"
User->>Mask : Adjust threshold slider
Mask->>Mask : applyThreshold(imageData, threshold)
Mask->>Renderer : _renderPreview()
User->>Mask : Click/Move pointer (brush)
Mask->>Mask : _brush.applyStroke(x,y)
Mask->>Renderer : _renderPreview()
User->>Mask : Undo/Redo (Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y)
Mask->>History : undo()/redo()
History-->>Mask : previous/next snapshot
Mask->>Renderer : re-render preview
```

**Diagram sources**
- [MaskStep.js](file://src/ui/MaskStep.js)

**Section sources**
- [MaskStep.js](file://src/ui/MaskStep.js)

### RigStep: Character Type, Joint Editing, Undo/Redo
RigStep supports:
- Humanoid vs freeform skeleton estimation.
- Joint drag-and-drop editing with RigEditor.
- Undo/redo with keyboard shortcuts.
- “Bring to Life” enabled when minimum joints reached and all joints inside mask bounding box.

```mermaid
flowchart TD
Start(["Initialize RigStep"]) --> Estimate["Estimate joints (humanoid/freeform)"]
Estimate --> InitEditor["Create RigEditor with joint positions"]
InitEditor --> Edit["Drag joints / change type"]
Edit --> History["Push to JointHistory"]
History --> EnableBT{"Joints ≥ 3<br/>and inside mask?"}
EnableBT --> |Yes| BTEnabled["Enable 'Bring to Life'"]
EnableBT --> |No| BTDisabled["Disable 'Bring to Life'"]
BTEnabled --> Next["Proceed to PREPROCESSING"]
BTDisabled --> Next
```

**Diagram sources**
- [RigStep.js](file://src/ui/RigStep.js)
- [StateMachine.js](file://src/state/StateMachine.js)

**Section sources**
- [RigStep.js](file://src/ui/RigStep.js)
- [StateMachine.js](file://src/state/StateMachine.js)

### StageStep: Rendering, Motion, IK Drag, Export
StageStep integrates:
- WebGL rendering via NPRRenderer and MeshPuppet.
- Motion playback with MotionResolver and predefined clips.
- IK dragging for interactive pose adjustments.
- Export panel for screen recording with codec detection.
- Keyboard shortcuts for play/pause, clip selection, record toggle, and escape.

```mermaid
sequenceDiagram
participant User as "User"
participant Stage as "StageStep.js"
participant Renderer as "NPRRenderer"
participant Puppet as "MeshPuppet"
participant Solver as "ARAPSolver"
participant Resolver as "MotionResolver"
participant Export as "ExportPanel"
Stage->>Renderer : init(canvas)
Stage->>Puppet : init() and upload texture
Stage->>Solver : create ARAP solver
Stage->>Resolver : register clips
loop Animation Frame
Stage->>Resolver : resolve(dt)
Stage->>Solver : setHandles(targets, pinMapping)
Stage->>Solver : step(2)
Solver-->>Stage : currentPositions
Stage->>Puppet : updatePositions(positions)
Stage->>Renderer : drawFrame(timestamp)
alt Recording
Stage->>Export : captureFrame(gl)
end
end
User->>Stage : Pointer down/up/move (IK drag)
Stage->>Resolver : start/update/end drag
User->>Export : Start/Stop recording
```

**Diagram sources**
- [StageStep.js](file://src/ui/StageStep.js)

**Section sources**
- [StageStep.js](file://src/ui/StageStep.js)

### ExportPanel: Recording Controls and Timer
ExportPanel provides:
- Start/stop recording with overlay timer.
- Codec detection and error messaging.
- Visibility toggling for UI elements.

```mermaid
flowchart TD
Start(["Click Record"]) --> CheckCodec["Detect supported codec"]
CheckCodec --> CodecOK{"Codec available?"}
CodecOK --> |No| ShowError["toast('error', codec unsupported)"]
CodecOK --> |Yes| StartRec["VideoExporter.startRecording(30fps)"]
StartRec --> ShowOverlay["Show timer overlay"]
ShowOverlay --> Stop(["Click Stop"])
Stop --> StopRec["VideoExporter.stopRecording()"]
StopRec --> Download["Download blob as webm"]
Download --> End(["End"])
```

**Diagram sources**
- [ExportPanel.js](file://src/ui/ExportPanel.js)

**Section sources**
- [ExportPanel.js](file://src/ui/ExportPanel.js)

### SaveLoadPanel: Name Input, Save/Load
SaveLoadPanel offers:
- Character name input and save to browser storage.
- Load from storage with callback to App.
- Error handling for quota exceeded and failures.

```mermaid
flowchart TD
Start(["Click Save"]) --> GetData["getCharacterData()"]
GetData --> HasData{"Has data?"}
HasData --> |No| ToastError["toast('error', no character)"]
HasData --> |Yes| Save["saveCharacter(data, imageBlob)"]
Save --> Result{"Saved?"}
Result --> |Yes| ToastSuccess["toast('success', saved)"]
Result --> |No| HandleErr["Handle QUOTA_EXCEEDED or other error"]
HandleErr --> End(["End"])
ToastSuccess --> End
```

**Diagram sources**
- [SaveLoadPanel.js](file://src/ui/SaveLoadPanel.js)

**Section sources**
- [SaveLoadPanel.js](file://src/ui/SaveLoadPanel.js)

### SettingsPanel: NPR Rendering Parameters
SettingsPanel exposes:
- Sliders and color pickers for rendering parameters.
- Reset to defaults with remount.
- Real-time updates to renderer properties.

```mermaid
flowchart TD
Open(["Open Settings"]) --> Mount["Mount grid of sliders/colors"]
Mount --> Change["User adjusts slider/color"]
Change --> Update["onSettingChange(key, value)"]
Update --> Apply["Apply to renderer (directly or via SM)"]
Reset(["Reset Defaults"]) --> Rebuild["Remount with defaults"]
```

**Diagram sources**
- [SettingsPanel.js](file://src/ui/SettingsPanel.js)

**Section sources**
- [SettingsPanel.js](file://src/ui/SettingsPanel.js)

## Dependency Analysis
WizardUI depends on StateMachine for state updates and uses a step indicator mapping. Steps depend on shared state and callbacks to StateMachine. App coordinates all components and wires keyboard shortcuts and lifecycle hooks.

```mermaid
graph LR
SM["StateMachine.js"] --> |emits stateChanged| APP["App.js"]
APP --> |renders| WZ["WizardUI.js"]
APP --> |mounts| UP["UploadStep.js"]
APP --> |mounts| MSK["MaskStep.js"]
APP --> |mounts| RG["RigStep.js"]
APP --> |mounts| STG["StageStep.js"]
STG --> EXP["ExportPanel.js"]
APP --> SLP["SaveLoadPanel.js"]
APP --> SET["SettingsPanel.js"]
WZ --> |updates| SM
UP --> |callbacks| SM
MSK --> |callbacks| SM
RG --> |callbacks| SM
STG --> |callbacks| SM
```

**Diagram sources**
- [StateMachine.js](file://src/state/StateMachine.js)
- [App.js](file://src/App.js)
- [WizardUI.js](file://src/ui/WizardUI.js)
- [UploadStep.js](file://src/ui/UploadStep.js)
- [MaskStep.js](file://src/ui/MaskStep.js)
- [RigStep.js](file://src/ui/RigStep.js)
- [StageStep.js](file://src/ui/StageStep.js)
- [ExportPanel.js](file://src/ui/ExportPanel.js)
- [SaveLoadPanel.js](file://src/ui/SaveLoadPanel.js)
- [SettingsPanel.js](file://src/ui/SettingsPanel.js)

**Section sources**
- [StateMachine.js](file://src/state/StateMachine.js)
- [App.js](file://src/App.js)

## Performance Considerations
- Canvas rendering: MaskStep and RigStep use 2D canvas overlays; ensure efficient redraws by minimizing pixel writes and leveraging overlay blending.
- WebGL pipeline: StageStep runs a continuous animation loop; throttle unnecessary updates and avoid redundant texture uploads.
- Preprocessing: WizardUI shows progress during preprocessing; keep UI responsive by yielding to the event loop and updating labels incrementally.
- Memory: ExportPanel and VideoExporter should release resources promptly after stop recording.
- Accessibility: Ensure keyboard focus order and ARIA attributes remain valid during dynamic DOM swaps.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Drag-and-drop not working:
  - Verify paste handler registration and drag events on the drop zone.
  - Confirm file type validation and size checks.
- Undo/Redo not triggering:
  - Ensure keyboard shortcuts are not intercepted by inputs and that history instances exist in the active state.
- Export fails:
  - Check codec availability and show appropriate error via toast.
  - Ensure exporter is properly started/stopped and frames captured.
- Save/Load errors:
  - Handle quota exceeded and general failures with user-friendly messages.
- Rendering issues:
  - Validate WebGL initialization and texture upload paths; fall back gracefully with toasts.

**Section sources**
- [UploadStep.js](file://src/ui/UploadStep.js)
- [MaskStep.js](file://src/ui/MaskStep.js)
- [RigStep.js](file://src/ui/RigStep.js)
- [StageStep.js](file://src/ui/StageStep.js)
- [ExportPanel.js](file://src/ui/ExportPanel.js)
- [SaveLoadPanel.js](file://src/ui/SaveLoadPanel.js)
- [toast.js](file://src/ui/toast.js)

## Conclusion
PaperAlive’s UI system is a modular, state-driven wizard that cleanly separates concerns across steps and panels. StateMachine ensures predictable transitions and shared state synchronization. The architecture supports robust interactions, accessibility, and responsive design, enabling users to transform raster images into animated, interactive characters with intuitive tools and immediate feedback.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Keyboard Shortcuts and Accessibility
- Global shortcuts:
  - Ctrl+Z: Undo (global routing via StateMachine).
  - Ctrl+Shift+Z or Ctrl+Y: Redo.
- Stage-only shortcuts:
  - Space: Play/Pause.
  - Keys 1–6: Select motion clip.
  - R: Toggle recording.
  - Escape: Cancel drag/export.
- Accessibility:
  - ARIA roles and labels on interactive elements.
  - Focus management and keyboard navigation.
  - Toast notifications with alert semantics.

**Section sources**
- [App.js](file://src/App.js)
- [UploadStep.js](file://src/ui/UploadStep.js)
- [MaskStep.js](file://src/ui/MaskStep.js)
- [RigStep.js](file://src/ui/RigStep.js)
- [StageStep.js](file://src/ui/StageStep.js)
- [toast.js](file://src/ui/toast.js)

### Responsive Design Considerations
- Breakpoints:
  - Mobile (< 600px): Simplified step indicators, stacked controls, and compact panels.
  - Tablet (600–1024px): Adjusted canvas heights and settings panel width.
  - Desktop (> 1024px): Expanded controls and improved layout spacing.
- Canvas sizing:
  - StageStep adapts canvas max-height based on viewport and optional image dimensions.

**Section sources**
- [style.css](file://src/style.css)
- [StageStep.js](file://src/ui/StageStep.js)

### Data Binding and State Synchronization
- Shared state:
  - StateMachine holds loaded image, alpha mask, thresholds, histories, joint positions, character type, and renderer references.
- Step-to-State bindings:
  - Steps update shared state via callbacks; StateMachine emits events for UI updates.
- Type safety:
  - characterData.js defines core types used across the system.

**Section sources**
- [StateMachine.js](file://src/state/StateMachine.js)
- [characterData.js](file://src/types/characterData.js)
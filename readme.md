# Flux Modeler △

> **Editor's Note:** Please consider this a **beta version**. The intent is to improve it over time, but many features have not been extensively tested. If you run into a bug, your feedback would be greatly appreciated!

Flux Modeler is a comprehensive desktop application providing a graphical user interface (GUI) for the **EnergyPlus**  building energy simulation program. Integrated with an AI Assistant, it streamlines the entire building performance workflow—from 3D modeling to energy simulations, all the way to results visualization and compliance reporting.

![Energy Modeler Welcome Screen](./Pictures/welcome_screen.png)

## Table of Contents

- [Energy Modeler △](#energy-modeler-)
  - [Table of Contents](#table-of-contents)
  - [🚀 Getting Started](#-getting-started)
  - [✨ Core Capabilities](#-core-capabilities)
  - [⚡ EnergyPlus Integration](#-energyplus-integration)
  - [🤖 AI Assistant (Helios)](#-ai-assistant-helios)
    - [AI-Powered Actions (Tool Use)](#ai-powered-actions-tool-use)
    - [Design Inspector](#design-inspector)
    - [Results Critique](#results-critique)
    - [Interactive Tutor](#interactive-tutor)
      - [Proactive Suggestions](#proactive-suggestions)
    - [Generative Design](#generative-design)
      - [Guide for Performing the Optimization](#guide-for-performing-the-optimization)
    - [API Key Configuration](#api-key-configuration)
    - [Getting Your API Key](#getting-your-api-key)
      - [Google Gemini API Key 🔑](#google-gemini-api-key-)
      - [OpenRouter API Key 🔑](#openrouter-api-key-)
      - [OpenAI API Key 🔑](#openai-api-key-)
      - [Anthropic API Key 🔑](#anthropic-api-key-)
  - [UI Walkthrough 💻](#ui-walkthrough-)
  - [📖 In-Depth Feature Guide](#-in-depth-feature-guide)
    - [📋 Scene Definition Panels](#-scene-definition-panels)
    - [📜 Simulation Modules (Recipes)](#-simulation-modules-recipes)
  - [Analysis Modules 📊](#analysis-modules-)
    - [Desktop Integration (Electron)](#desktop-integration-electron)
  - [🛠️ For Developers: Building from Source](#️-for-developers-building-from-source)
    - [Prerequisites](#prerequisites)
    - [Setup and Development](#setup-and-development)
    - [Building for Distribution](#building-for-distribution)
      - [Build for macOS 🍎](#build-for-macos-)
      - [Build for Windows 💻 (from any platform)](#build-for-windows--from-any-platform)
    - [Cross-Platform Building](#cross-platform-building)
  - [🛠️ Technology Stack](#️-technology-stack)
  - [License 📄](#license-)

## 🚀 Getting Started

To use Flux Modeler, you need a modern web browser and a local installation of EnergyPlus. The desktop version (recommended) offers the best experience.

1. **Install Required Software**:

   - **EnergyPlus**: Download and install [EnergyPlus](https://energyplus.net/) from the official website. The application supports EnergyPlus 25.1 and later versions.

2. **Download Flux Modeler**:
   Download the latest release for your operating system (macOS or Windows) from the project's Releases page.

3. **Run the Application**:
   - *Windows*: Run the Flux Modeler Setup `.exe` installer.
   - *macOS*: Open the Flux Modeler `.dmg` and drag the application to your Applications folder.

**Security Warnings on First Launch**:

Because the app isn't code-signed, your OS might show a security warning. When a user on a Mac downloads and tries to open the unsigned app, they will be stopped by Gatekeeper, which will show a message like "Flux Modeler cannot be opened because the developer cannot be verified."

- **On Windows (SmartScreen)**: Click "**More info**", then click "**Run anyway**".

- **On macOS (Gatekeeper)**: **Right-click** (or Control-click) the app icon, select "**Open**" from the menu. A new dialog box will appear that is similar to the first one, but this time it will include an "**Open**" button. Clicking this will run the app. You only need to do this once. After the first successful launch, the app can be opened normally by double-clicking it. Or After you drag Flux Modeler.app to the Applications folder, do the following:

- Open the Terminal app.
- Copy and paste the following command exactly, then press Enter:

```bash
xattr -cr /Applications/Flux\ Modeler.app
```

---

## ✨ Core Capabilities

Flux Modeler provides comprehensive to model energy consumption—for heating, cooling, ventilation, lighting and plug and process loads:

### EnergyPlus Simulation

- **Complete Building Energy Modeling**: Integration with EnergyPlus for whole-building energy analysis, including heating, cooling, ventilation, and lighting energy consumption.

- **Thermal Zone Management**: Define and configure thermal zones with detailed settings for HVAC systems, internal loads, and occupancy schedules.

- **Material & Construction Library**: Access to comprehensive libraries of building materials, construction assemblies, and schedules, with defaults that can be customized for your project.

- **HVAC System Templates**: Pre-configured HVAC system templates for common configurations, including ideal loads, VAV systems, and more.

- **Weather-Based Analysis**: Leverage EPW weather files for climate-specific energy modeling, with automatic integration of location and climate data.

- **Simulation Settings**: Granular control over simulation parameters including timesteps, shadow calculations, sizing periods, and convergence limits.

- **Validation & Readiness Checks**: Built-in validation tools that check your EnergyPlus configuration for completeness and flag common issues before running simulations.

- **IDF Generation**: Automated generation of complete EnergyPlus Input Data Files (IDF) from your 3D model, with proper zone definitions, surface constructions, and fenestration systems.

- **Results Dashboard**: Comprehensive visualization of energy simulation results including annual energy consumption, heating/cooling loads, and zone temperatures.

### General Application Features

- **Parametric Scene Modeling**: Define room dimensions, orientation, window-to-wall ratios (WWR), and shading devices like overhangs, light shelves, louvers, and roller shades.

- **Geometry Importer**: Import `.obj` models, with an interactive UI to tag surfaces (walls, floors, glazing) for simulation setup.

- **Context & Site Modeling**: Adding surrounding context, either through simple massing tools, topography from heightmaps, or by automatically fetching building data from OpenStreetMaps.

- **Interior Furniture Library**: Place simple furniture and partition objects from a pre-built library via drag-and-drop or import custom `.obj` assets.

- **File System Integration**: Using the File System Access API (or Electron's APIs), Flux Modeler can directly read from and save to a local project folder, enabling a seamless desktop-like experience.
  
- **AI Assistant (Helios)**: An integrated, context-aware AI chat powered by generative AI (Google Gemini, Anthropic, OpenAI, OpenRouter models) to help answer questions and directly manipulate the scene, run simulations, and control the UI using natural language commands.

- **Automated Report Generation**: Generate comprehensive HTML reports with a single click. The report includes project details, a 3D scene snapshot, and key performance metrics, ready for printing or saving as a PDF.

- **Climate Data Analysis**: Generate an interactive dashboard from the loaded EPW file, including a wind rose, solar radiation charts, and temperature profiles to better understand the site context.

- **Keyboard Shortcuts**: Accelerate your workflow with keyboard shortcuts for common actions, such as `T` for Top View, `P` for Perspective, and `Ctrl+S` to save the project. A help modal (`?`) displays all available shortcuts.

- **Multi-View Layout (Quad View)**: Split the main viewport into four synchronized cameras (Perspective, Top, Front, Side) for comprehensive spatial awareness and precise object placement, a standard in professional 3D software.

---

## ⚡ EnergyPlus Integration

The EnergyPlus integration brings professional whole-building energy modeling directly into the Flux Modeler workflow. The application generates complete IDF (Input Data File) models from your 3D geometry and runs EnergyPlus simulations to analyze heating, cooling, and lighting energy consumption.

### Architecture & Workflow

The EnergyPlus functionality is organized into several specialized modules:

- **`energyplus.js`**: Main entry point that initializes the EnergyPlus functionality and coordinates the IDF generation workflow.

- **`energyplusConfigService.js`**: Centralized configuration management that provides helper functions for reading, updating, and normalizing EnergyPlus settings from the project metadata, ensuring backward compatibility.

- **`energyplusValidation.js`**: Pre-simulation validation utilities that check the configuration for run readiness and identify common issues like missing weather files or incomplete zone definitions.

- **`energyplusDefaults.js`**: Default material properties, construction assemblies, schedules, and other parameters loaded from a curated JSON library.

- **`energyplusModelBuilder.js`**: Core IDF generation logic that transforms the 3D scene geometry and configuration into a complete, valid EnergyPlus input file.

- **`energyplusSidebar.js`**: UI management for the EnergyPlus panel, including simulation recipes and configuration buttons for materials, constructions, schedules, and loads.

### Configuration Panels

The EnergyPlus sidebar provides access to comprehensive configuration options:

#### Project Setup

- **Building Type & Location**: Define building characteristics and geographic location for climate-specific analysis.
- **Simulation Timesteps**: Control the temporal resolution of the simulation (timesteps per hour).
- **Shadow Calculation**: Configure shadow calculation methods, frequency, and algorithms for accurate solar gains.
- **Sizing Periods**: Define specific weather file periods for HVAC sizing calculations.

#### Materials & Constructions

- **Material Library**: Browse and select from a comprehensive library of building materials with thermal properties (conductivity, density, specific heat).
- **Construction Assemblies**: Define multi-layer construction assemblies for walls, roofs, floors, and glazing systems.
- **Custom Materials**: Create custom materials with user-defined thermal properties.

#### Schedules

- **Occupancy Schedules**: Define time-varying occupancy patterns for different space types.
- **Equipment & Lighting Schedules**: Control when equipment and lighting are active throughout the year.
- **HVAC Schedules**: Define heating and cooling availability schedules.
- **Schedule Types**: Support for hourly, daily, weekly, and annual schedule patterns.

#### Internal Loads

- **People**: Define occupant density, activity levels, and metabolic heat generation.
- **Lighting**: Configure installed lighting power density (W/m²) and schedules.
- **Equipment**: Set plug load densities for computers, appliances, and other equipment.

### Workflow Integration

The EnergyPlus integration seamlessly connects with the existing 3D modeling workflow:

1. **Geometry Translation**: The application automatically converts the parametric room geometry or imported OBJ models into EnergyPlus zone definitions with proper surface constructions.

2. **Fenestration Systems**: Window definitions from the Apertures panel are translated into EnergyPlus fenestration surfaces with appropriate glazing constructions.

3. **Shading Devices**: External shading elements (overhangs, louvers, light shelves) are exported as detached shading surfaces in the IDF.

4. **IDF Generation**: The `energyplusModelBuilder` assembles all configuration data into a complete IDF file following EnergyPlus formatting conventions.

5. **Simulation Execution**: The application can execute EnergyPlus simulations directly and monitor progress through the integrated console.

6. **Results Visualization**: Energy simulation results are displayed in dashboards showing annual energy consumption, zone temperatures, and heating/cooling loads.

### Validation & Error Checking

Before running a simulation, the `energyplusValidation` module performs comprehensive checks:

- **Required Files**: Verifies that all necessary files (weather data, schedules) are present.
- **Zone Definitions**: Ensures all thermal zones have valid geometry and construction assignments.
- **Material Consistency**: Checks that all referenced materials and constructions are properly defined.
- **HVAC Configuration**: Validates HVAC system definitions and schedules.
- **Numeric Ranges**: Confirms that all numeric parameters are within valid EnergyPlus ranges.

The validation results are displayed in a user-friendly checklist, with specific guidance on how to fix any identified issues.

---

## 🤖 AI Assistant (Helios)

The AI Assistant panel provides a chat interface to help you with your workflow. It understands the application's current state and can perform actions on your behalf using natural language commands.

---

### AI-Powered Actions (Tool Use)

Beyond answering questions, the assistant can directly manipulate the UI and query project data. This allows for a powerful natural language workflow. Its capabilities include:

- **Project Validation**: Ask it to `"validate my project for an annual glare simulation"` and it will check for common setup errors, such as a missing weather file or an incorrect viewpoint type, and report back any issues.
- **Advanced Scene Manipulation**:
  - **Shading**: `"Add a 0.5 meter deep overhang to the south wall."`
  - **Sensor Grids**: `"Enable a sensor grid on the floor with 0.75m spacing."`
  - **Daylighting**: `"Enable continuous daylighting controls with a setpoint of 500 lux."`
- **Simulation & Recipe Control**:
  - **Global Parameters**: `"Set the global ambient bounces to 5."`
  - **Recipe Configuration**: `"In the open illuminance recipe, change the time to 9:00 AM."`
- **Conversational Data Exploration & Comparison**:
  - **Data Query**: `"What is the average illuminance for the current results?"` or `"How many points are above 500 lux?"`
  - **Time Scrubbing**: `"Show me the results for the winter solstice at noon."`
  - **Dashboard Control**: `"Open the glare rose diagram."`
  - **Comparative Analysis**: `"Which of my two designs has better daylight uniformity?"` or `"Compare the sDA for both designs."`
- **File Management**:
  - **Load Results**: `"Load a results file into dataset A."`
  - **Clear Results**: `"Clear all loaded results data."`

### Design Inspector

The AI analyzes the entire project state to identify conflicting or suboptimal combinations of settings, explains the potential consequences, and offers a one-click fix.

> **AI Analysis:** "I've reviewed your project. Your wall reflectance is quite low (0.2), and you're only using 2 ambient bounces. This combination will likely result in an unrealistically dark rendering with noticeable splotches. I recommend increasing ambient bounces to 4 and wall reflectance to 0.5."
> **[Apply Fixes]**

### Results Critique

After a simulation completes, the AI can analyze the results, identify problems, and suggest specific, actionable design changes.

> **AI Analysis:** "The Daylight Glare Probability (DGP) is 0.47, which is considered 'Intolerable'. This is caused by low-angle sun from the west-facing window. To fix this, I suggest adding vertical louvers."
> **[Add Vertical Louvers]**

### Interactive Tutor

The AI can act as a tutor to guide new users through complex simulation workflows step-by-step, teaching them the process as they go.

> **User**: "How do I run a glare simulation?"

> **AI**: "Of course! To calculate DGP, we need a 180° fisheye view. Your current viewpoint is set to Perspective. Would you like me to change it for you?"

> **User**: "Yes"

> **AI**: *(Changes viewpoint)* "Great. Next, I'll open the DGP recipe panel for you." *(Opens recipe)* "Now you just need to click 'Generate Package' and run the simulation."

#### Proactive Suggestions

The AI Assistant monitors user actions and provides contextual, non-intrusive suggestions to guide the workflow and prevent common errors. These suggestions appear as dismissible chips in the UI. For example:

- After loading an **EPW weather file**, it will suggest configuring EnergyPlus simulation settings.
- If a material's **thermal properties are incomplete**, it will warn that the simulation may fail.
- If **HVAC system is not defined**, it will suggest setting up a system template.

### Generative Design

Leverage the AI to perform automated, multi-step design tasks.

- **Scene Creation from Natural Language**: Instead of manually adjusting sliders, describe the space you want to build in plain English.

    > "Create a long office, 12 meters deep by 5 meters wide, with a 3-meter high ceiling. Put a large, continuous window across the entire south wall with a sill height of 0.8 meters. Add a 1-meter deep overhang above it and place two desks in the middle of the room."
- **Design Optimization**: Define a goal, constraints, and a design variable, and the assistant will orchestrate the entire workflow to find the best solution. For example:

    > "Find an overhang depth for the south wall between 0.5m and 2.0m that minimizes annual cooling loads."

---

### API Key Configuration

The integrated AI Assistant requires an API key to function. It supports multiple providers for greater flexibility.

- **Expanded Provider Support**: Select between **OpenRouter**, **OpenAI**, **Google Gemini**, and **Anthropic**.
- **Provider-Specific Keys**: The application saves a separate API key for each provider, so you can switch between models without re-entering credentials.
- **AI Configuration**: A settings modal allows you to select your preferred provider, choose from a list of popular models (e.g., **Gemini 2.5 Pro**, **GPT-5**, **Claude 4.5 Sonnet**), or enter a custom model ID. The app also supports many free and lite models available through OpenRouter.

---

### Getting Your API Key

#### Google Gemini API Key 🔑

You can get a free API key for the Gemini family of models from [Google AI Studio](https://aistudio.google.com/prompts/new_chat).

1. Go to the Google AI Studio website.
2. Sign in with your Google account.
3. Click the "`Get API key`" button, usually located in the top-left or top-right corner of the page.
4. A dialog will appear. Click "`Create API key`".
5. Your new API key will be generated and displayed.
6. Copy this key and paste it into the API Key field in the Flux Modeler AI settings.
*Note*: The Gemini API has a free tier with usage limits. Be sure to review Google's current pricing and terms of service.

#### OpenRouter API Key 🔑

OpenRouter provides access to a wide variety of models from different providers through a single API.

1. Go to the [OpenRouter.ai](https://openrouter.ai/) website and log in.
2. Click on your account icon in the top-right corner and select "`Keys`" from the dropdown menu.
3. Click the "`+ Create Key`" button. Give your key a name (e.g., "EnergyModeler") and click "`Create`".Your new API key will be generated.
4. Copy this key and paste it into the API Key field in the Flux Modeler AI settings.
*Note*: OpenRouter is a paid service. You will need to add credits to your account to use most models. To use some of the free models, you may need to adjust your privacy settings to allow your data to be used for model improvement.

#### OpenAI API Key 🔑

1. Go to the [OpenAI API keys](https://platform.openai.com/api-keys) page and log in.
2. Click the "`+ Create new secret key`" button.
3. Give your key a name (e.g., "FluxModeler") and click "`Create secret key`".
4. Copy the generated key immediately and paste it into the API Key field in the Flux Modeler AI settings. You will not be able to view it again.

#### Anthropic API Key 🔑

1. Go to the [Anthropic Console](https://console.anthropic.com/) and log in.
2. Navigate to the "API Keys" section in your account settings.
3. Click the "`Create Key`" button.
4. Give the key a name and click "`Create Key`".
5. Copy the key and paste it into the API Key field in the Flux Modeler AI settings.

**Important**: Treat your API keys like passwords. Do not share them publicly or commit them to version control.

## UI Walkthrough 💻

The interface is designed around a logical workflow, guiding the user from setup to analysis.

![Flux Modeler Main UI](./Pictures/main_ui.png)
![Flux Modeler Main UI](./Pictures/main_ui_quad.png)
![Flux Modeler Panels](./Pictures/panels_ui.png)

- **3D Viewport (Center)**: This is the main interactive area where your 3D scene is displayed. You can navigate using standard orbit controls (mouse drag, scroll). The viewport can also be split into a **Quad View** layout, showing synchronized Perspective, Top, Front, and Side cameras for comprehensive spatial awareness.

- **Left Toolbar**: This is the primary command center for building your scene. It contains buttons to open floating panels for defining all aspects of the physical model, from **Project Setup** and **Dimensions** to **Simulation** and **Analysis** modules.

- **Top View Controls**: A quick-access toolbar to instantly switch between standard orthographic (Top, Front, etc.) and perspective camera views. It also includes the button to toggle the **Quad View** layout.

- **Bottom Toolbar (Bottom-Left)**: Provides quick access to global actions like saving/loading project files, viewing application information and keyboard shortcuts, and launching the AI Assistant.

- **Floating Panels**: All scene definition, simulation, and analysis tools open as independent floating windows. These panels can be dragged, resized, collapsed, and arranged anywhere on the screen, allowing you to create a workspace tailored to your needs.

- **AI Assistant Sidebar (Right)**: A dedicated, resizable sidebar that houses the conversational AI Assistant. This keeps the AI's powerful capabilities accessible without cluttering your modeling and analysis workflow.


### Desktop Integration (Electron)

Flux Modeler operates as an Electron-based desktop application, enabling direct interaction with your file system.

- **Standardized Project Folder**: When you save a project, the application creates a complete, organized folder structure on your local machine, with separate directories for geometry, materials, weather files, scripts, and results.

- **Simulation Console**: A built-in console window appears when you run simulations, showing the live output from EnergyPlus processes and reporting the final exit code (success or failure).

- **Parallel Simulation Support**: The application can run multiple simulations in parallel (for optimization workflows) or execute headless background runs for automated design exploration.

## 🛠️ For Developers: Building from Source

You can run the application in a local development environment or build a distributable, single-click installer for macOS and Windows using `electron-builder`.

### Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js and npm**: [Download & Install Node.js](https://nodejs.org/en) (npm is included).
- **Git**: [Download & Install Git](https://git-scm.com/).

### Setup and Development

1. **Clone the Repository and Install Dependencies**

    ```bash
    # Clone the repository
    git clone [https://github.com/your-username/ray-modeler.git](https://github.com/your-username/ray-modeler.git)
    
    # Navigate into the project directory
    cd ray-modeler
    
    # Install the necessary npm packages
    npm install

    # Update the npm packages
    npm update
    ```

2. **Run the App in Development Mode**

    To run the full Electron application with all features (including file system access and simulation execution), use the start script:

    ```bash
    npm start
    ```

    This will launch the application in a development window with access to developer tools.

### Building for Distribution

The following commands use `electron-builder` to package the application into a distributable format. The final installer/application files will be located in the `dist/` directory.

#### Build for macOS 🍎

This command bundles the application into a standard `.dmg` disk image for macOS.

```bash
npm run build:mac
```

#### Build for Windows 💻 (from any platform)

This command creates NSIS installers (`.exe`) for both **x64** and **arm64** Windows architectures.

**Prerequisite for macOS/Linux users**: To build a Windows app on a non-Windows machine, you must have [Wine](https://www.winehq.org/) installed. You can install it easily with Homebrew:

```Bash
brew install --cask wine-stable
```

Once Wine is installed, run the build script:

```Bash
npm run build:win
```

This will generate two installers in the dist/ folder, for example: Energy Modeler Setup 1.1.0-x64.exe and Energy Modeler Setup 1.1.0-arm64.exe.

### Cross-Platform Building

While it's recommended to build for a specific platform on that platform (e.g., build for Windows on a Windows machine), `electron-builder` supports cross-platform compilation with some setup:

- **Building for Windows on macOS/Linux**: Requires installing **Wine**.

- **Building for macOS on Windows/Linux**: Requires a macOS machine for code signing, so it's not practically feasible.

- **Building for Linux on macOS/Windows**: Can be done directly.

For detailed instructions on cross-platform builds, please refer to the [electron-builder documentation](https://www.electron.build/multi-platform-build).

## 🛠️ Technology Stack

- **3D Rendering**: [Three.js](https://threejs.org/)

- **Energy Simulation Engine**: [EnergyPlus](https://energyplus.net/)

- **Data Visualization**: [Chart.js](https://www.chartjs.org/)

- **Mapping**: [Leaflet](https://leafletjs.com/)

- **UI Framework**: [Vanilla JS](http://vanilla-js.com/), HTML5, [CSS3 with TailwindCSS utilities](https://tailwindcss.com/)

- **Desktop App**: [Electron](https://www.electronjs.org/) (optional, for direct script execution)

## License 📄

This project is licensed under the [MIT](https://opensource.org/license/mit) License - also see the LICENSE file for details.

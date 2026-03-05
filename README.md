# Collaborative Whiteboard

A feature-rich whiteboard application with drag-and-drop functionality, similar to Google's Collaborative Whiteboard.

## Features

- **Drawing Tools**: Freehand pen, line, shapes (rectangle, circle, triangle), arrow, and text
- **Drag & Drop**: Move, resize, and rotate any object on the canvas
- **Color Picker**: Choose from preset colors or use custom colors
- **Stroke Width**: Adjustable stroke width for all drawing tools
- **Selection Tool**: Select, move, and manipulate objects
- **Keyboard Shortcuts**:
  - Delete/Backspace: Delete selected objects
  - Ctrl+C: Copy selected object
  - Ctrl+V: Paste copied object
- **Actions**: Undo, Delete, Clear canvas

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

1. Select a tool from the toolbar
2. Draw on the canvas
3. Use the selection tool (arrow icon) to drag and drop objects
4. Adjust colors and stroke width as needed
5. Delete objects using the Delete button or keyboard shortcuts

## Tech Stack

- React 18
- Vite
- Fabric.js (for canvas manipulation and drag-drop)

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

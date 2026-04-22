# Prerequisites viewer

The **Prerequisites** tab renders the CSCE/CPEN/ECEN catalog as an
interactive graph so you can see what leads to what.

## Controls

- **Search** box: jump to a course node and center the graph on it.
- **Subject filter:** limit the graph to CSCE, CPEN, ECEN, or any
  combination.
- **Level filter:** e.g. *100-level only*, *400-level and up*.
- **Layout:** toggle between hierarchical (top-down by level) and
  force-directed.

## Reading a node

Each node shows the course code, title, and credit hours. Edge arrows point
**from prerequisite → to course that requires it**.

- **Solid edge:** hard prerequisite (must be completed with C- or better).
- **Dashed edge:** concurrent / "C or concurrent enrollment".
- **Double edge:** one of several alternative paths (e.g. MATH 151 *or*
  MATH 171).

## Highlight what you've taken

If you're signed in, completed courses light up green and in-progress
courses light up blue. This makes it easy to spot the next eligible course
on a chain — any neighbor of a green node whose other predecessors are also
green is a valid next step.

## Export

Use the **Export PNG** button in the bottom-right to save the current view
as an image (helpful for advising appointments).

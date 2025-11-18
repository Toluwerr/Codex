You are an expert Minecraft Education code assistant who writes complete, working code for the Minecraft Agent in Code Builder.

I want you to generate code that makes the Agent automatically build a large, detailed mansion in Minecraft Education Edition, using the Agent only.

1. Environment and Language

Assume this is in Minecraft Education Edition with Code Builder.

Use the Python Agent API for Minecraft Education (Code Builder).

Use only functions and APIs that are available in Minecraft Education Code Builder (no external libraries).

The final result must be ready to paste directly into the Python editor in Code Builder.

2. General Behavior

The Agent will:

Start standing next to the player.

Teleport to a safe starting position before building.

Clear a rectangular area where the mansion will be built (remove trees, grass, flowers, etc., down to a specified level).

Build the entire mansion block by block using loops and helper functions.

The code must be organized, readable, and not just one giant function.

3. Code Structure Requirements

Write the code using this general structure:

A block of configurable variables at the top, for example:

MANSION_WIDTH

MANSION_LENGTH

MANSION_HEIGHT

FLOORS (number of floors)

FOUNDATION_Y_LEVEL

Block types (e.g., main wall block, floor block, roof block, window block, door block, etc.)

Several clear helper functions, for example:

clear_area()

build_foundation()

build_walls()

build_floor(level)

build_rooms(level)

build_staircase()

build_roof()

add_windows_and_doors()

decorate_exterior()

place_lighting()

build_path_and_garden()

A main() function that:

Teleports Agent to the starting spot.

Calls clear_area().

Calls functions in a logical order to build the entire mansion.

A call at the bottom to run main() when the script starts.

Add comments throughout the code to explain what each function does and why.

4. Mansion Design Requirements (High Level)

Design and build a 3-story mansion (or configurable number of floors) that looks impressive and realistic, not just a simple box.

Style: Modern + luxury feel (clean lines, big windows, good lighting).

Floors: At least 3 levels:

Ground floor (Level 1): Entry hall, main hall, side rooms.

Second floor (Level 2): Bedrooms, balcony.

Third floor (Level 3 or attic): Open space or lounge.

Exterior:

Symmetrical front facade (left & right sides mirror each other).

Big front entrance with double doors.

Large windows placed evenly.

Roof that looks like a real roof (sloped or tiered, not a flat box).

Interior:

Separate rooms with interior walls.

Staircase connecting all floors.

Different floor materials in different areas (e.g., wood floors in rooms, stone floor in hallway).

Simple “furniture” shapes (e.g., beds, tables, counters) using basic blocks.

5. Exact Details for the Mansion (You Fill in the Specific Blocks and Values)

Use reasonable default values that can be changed in the config section. For example:

Default mansion footprint: about 30x20 blocks.

Height per floor: about 4–5 blocks tall inside.

Blocks (use Education block names):

Main walls: e.g., quartz block or white concrete.

Trims and corners: darker block (e.g., dark oak planks or stone bricks).

Floors: different wood types for each level.

Roof: darker block (e.g., dark oak stairs / slabs or stone brick stairs).

Windows: glass panes or glass blocks.

Path: stone or cobblestone.

Garden: grass, leaves, flowers, hedge fences, etc.

You choose the exact block IDs that exist in Minecraft Education Python API, but make sure they are valid.

6. Positioning and Coordinates

Let the mansion be built relative to the Agent’s starting position.

For example:

Let the Agent’s initial position be the front-left corner of the mansion footprint.

The Agent builds forward (Z+) and to the right (X+) from there.

Clearly document in comments where the origin corner is and how the mansion extends from that point.

7. Clearing the Area

Implement a clear_area() function that:

Uses nested loops to:

Move the Agent over the entire build area.

Clear blocks from GROUND_Y_LEVEL up to a certain height (e.g., FOUNDATION_Y_LEVEL + MANSION_HEIGHT + extra).

Replace ground blocks with a consistent ground (e.g., grass block or stone) at and just below FOUNDATION_Y_LEVEL.

8. Foundation and Floors

build_foundation():

Fills the entire footprint (width x length) with a solid base layer.

Optionally adds a 1-block high foundation border around the edge.

For each floor:

Build a solid floor layer.

Ensure there is enough vertical interior space (height per floor).

Align staircase openings so players can walk between floors.

9. Walls and Rooms

Exterior walls:

Use nested loops to build walls around the edges.

Leave openings for doors and windows where needed.

Interior walls:

Subdivide each floor:

Ground floor:

Entry hall / foyer near the main door.

At least 2 side rooms.

Second floor:

At least 2–3 bedrooms / rooms separated by walls.

A hallway or landing coming off the staircase.

Third floor:

Could be one big open loft / lounge.

Use at least 1–2 different interior wall materials or accents for visual variety.

10. Staircase

Implement build_staircase():

Build a staircase inside the mansion that:

Starts on the ground floor in the main hall.

Reaches the second floor.

Another flight reaches the third floor.

Use actual stair blocks (e.g., wooden stairs or stone brick stairs).

Make sure there is enough headroom above the stairs (no blocks directly over the steps).

11. Roof

Implement build_roof():

Create a roof that:

Extends slightly beyond the walls (overhang).

Uses stair and/or slab blocks to create a sloped or layered look.

The roof should be centered and symmetrical, not just a flat layer.

Ensure that the roof encloses the top floor without leaving gaps.

12. Windows and Doors

add_windows_and_doors():

Place double doors at the front entrance (centered on the front wall).

Add windows:

Regular spacing on the front and back walls.

Tall vertical windows or grouped windows on sides.

Avoid placing windows that clash with interior staircase or walls when possible.

Use either glass panes or glass blocks, but be consistent.

13. Lighting

place_lighting():

Add lighting blocks (e.g., lanterns, torches, or glowstone) to:

Main entrance.

Hallways and stairs.

Each room.

Exterior near door and along the path.

Use a pattern so it looks intentional, not random.

14. Exterior Decoration

decorate_exterior() and build_path_and_garden():

Create a path from the front door outward a short distance (e.g., 6–10 blocks).

Add a small garden or landscaping area:

Simple hedges with leaves or fences.

A couple of trees or bushes.

Flowers along the path.

Optional: small front porch or overhang at the entrance.

15. Performance and Safety

Use loops efficiently, but avoid extremely deep nested loops that could lag too much.

Do not dig below a safe ground level.

Avoid infinite loops.

Ensure the Agent does not wander far from the build area.

16. What to Output

Please output:

The complete Python script for Minecraft Education using the Agent, ready to paste into Code Builder.

Include clear comments at the top explaining:

How to change the configuration variables (mansion size, materials).

Where to stand in relation to the Agent before running the code.

Roughly how long it might take to build (just a general idea).

Make sure the script runs from top to bottom without needing any manual changes besides configuration values.

If something in Minecraft Education’s Python Agent API does not support a feature, adjust the design in the simplest way that still produces a clean, detailed multi-floor mansion.

---
description: How to move around the city, and what hovering or clicking a building does.
---

# Navigating

The city is a real 3D scene, not a picture. Nothing here changes the data — these are just the
controls for looking at it.

## Controls

| You want to | Desktop / trackpad | Phone or tablet |
| --- | --- | --- |
| **Move across the map** | drag with the left button | drag with one finger |
| **Spin around what you are looking at** | slide two fingers | drag with two fingers |
| **Zoom in and out** | pinch, mouse wheel, or shift-scroll | pinch with two fingers |
| **Rotate and tilt** | drag with the right button | drag with two fingers |
| **Look at one wallet** | hover it, then click | tap it |
| **Fill the screen** | the **Full screen** button · Esc to leave | the **Full screen** button |

Dragging moves the city **like a map** — the ground follows your cursor. It does not swing the
camera around a hidden centre point, which is the thing that makes 3D scenes feel like they are
anchored to somewhere you did not choose.

Sliding two fingers **orbits around the point you are looking at**, and that point is yours to
choose: click a building and the camera settles on it, so two fingers then circle that building.
Panning carries the pivot with you, so the thing you orbit is always the thing in front of you.

Zoom is limited at both ends: close enough to stand in a street, far enough to hold the whole island
and the boroughs in one frame. The tilt stops just short of the horizon, because a camera below the
skyline reads as a bug rather than a view.

## Hovering versus clicking

These do deliberately different amounts of work.

**Hovering** puts a wireframe cage around the building and shows a small label: who lives there,
how much they hold, how long they have held it, and whether they have been buying or selling. It is
text only, and it disappears the moment you move away.

**Clicking** pins the wallet and opens the full card, including its portfolio preview and a link to
open the address in a block explorer.

The split exists because the city is dense. At most zoom levels your cursor is over *some* building
almost all the time, so anything heavy on hover — especially a card that loads a remote image — turns
ordinary panning into a slideshow of things you did not ask for. Hover is a peek; clicking is the
decision to look properly.

Clicking empty sky clears the pinned card. That is the way back to just looking at the city.

## Finding a specific wallet

**Where do you live?** takes any address and places it. If the wallet clears the mode's bar it will
fly to its building and pulse it. If it does not, the city will still show you where that address
*would* live — the street address is derived from the address itself, so it exists whether or not
anyone qualifies to build on it.

## The arrival flight

Opening the city plays a scripted approach: in low over the harbour, up the length of the island
through the towers, then back to a wide shot.

Any input cancels it — a click, a scroll, or dismissing the panel over the top of it. Cancelling
hands you the camera **exactly where the flight had reached**. It does not jump you to a fixed
starting position, because being teleported somewhere the moment you touch something reads as the
page resetting itself.

## Performance

The city measures its own frame times and quietly lowers the render resolution if it cannot keep up,
raising it again when it can. Text labels are drawn separately and stay sharp at any resolution.

This means the city degrades in **sharpness**, not in **content**: a slower device shows every
building the fast one does. Nothing is dropped to make it run.

# What people praise in phone and TV home screens, and what Hive takes

Research for the phone-style home screen on the `home-phone` preview
(November 2026). For each feature: what it is, why reviewers and users like it
(with sources), what they dislike, and whether it fits Hive on a phone, a
tablet, and the wall-mounted fridge display (1080×1920 portrait or
1920×1080 landscape, touch, read from across the kitchen).

Most sources are reviews (MacStories, Six Colors, Android Police, 9to5Mac,
AppleInsider) plus Apple's own WWDC design talk. Forum and blog posts are
marked as anecdotal where they are the only source.

## Apple: iPhone

### Widget stacks and Smart Stack

**What:** several widgets of one size piled in one slot; swipe up or down to
flip between them. A Smart Stack can rotate on its own to whatever is likely
useful now (time of day, location, activity).

**Praise:** stacks are what make StandBy useful: "swiping up or down on
either side of the screen moves through different widgets", and the rotation
can be turned off for manual control ([TapSmart](https://www.tapsmart.com/tips-and-tricks/standby-mode/)).
Stacks let a small screen hold far more than its grid.

**Dislikes:** automatic rotation is "hit or miss … I've found its suggestions
generic at best" ([MacStories, iOS 14 review](https://www.macstories.net/stories/ios-and-ipados-14-the-macstories-review/6/)).

**Hive:** yes, everywhere. Hive knows exactly what matters by the hour
(chores in the morning, dinner from mid-afternoon, a trip about to start), so
its rotation can be rules about the household instead of guesses. Rotation is
per stack and can be off; a manual swipe holds for 30 minutes.

### Interactive widgets

**What:** ticking a to-do or a chore right on the widget, without opening
the app (iOS 17).

**Praise:** the general comparison holds that Android's "fully interactive,
resizable widgets" saved people more time until iOS caught up
([Digital Reach](https://digitalreachsolutions.com/iphone-widgets-vs-android-widgets-home-screen-time-saving/), a blog).

**Hive:** already built (chores, shopping, to-dos tick in place). Kept.

### Free placement, larger icons, dark and tinted icons (iOS 18)

**What:** icons go anywhere on the grid with gaps; icons can be large without
labels; a dark style and a tint that recolours every icon.

**Praise:** "apps can go anywhere … you can now leave open spaces in that
grid" ([Six Colors](https://sixcolors.com/post/2024/09/ios-18-review/));
dragging apps to any space "rather than them always flowing in from the
top-left is a welcome change" ([Stuff](https://www.stuff.tv/features/the-new-ios-18-home-screen-feature-im-most-excited-about-is-not-the-one-youd-expect/)).

**Dislikes:** tint is the most criticised part: icons "become illegible"
([Android Authority](https://www.androidauthority.com/ios-18-hands-on-3450497/));
"a lot of tinted icons also look bad" ([MacStories, iOS 18](https://www.macstories.net/stories/ios-and-ipados-18-the-macstories-review/3/));
one colour on everything turns the screen into "a game of 'hunt the icon'"
(Stuff). Widget resizing "sometimes makes them jump around, including to the
next screen" (Six Colors).

**Hive:** free gaps don't survive Hive's reflow (the same layout is 4 columns
on a phone and 8 on the fridge), so Hive offers **page breaks** instead: start
a page wherever you like, and it stays a page on every screen. Icon styles:
yes, but each style keeps something of the app's own colour so icons can
still be told apart (see "Icon styles" below). Resizing never jumps more than
one page (already true of `pack`).

### App Library

**What:** an automatic last page with every app, grouped, with search.

**Praise:** "a great new way to quickly find the app you're looking for
without doing any manual sorting" ([MacStories overview](https://www.macstories.net/news/ios-and-ipados-14-the-macstories-overview/)).
**Dislike:** "there's no way to turn it off" (same review).

**Hive:** already built, and it can be turned off. Kept.

### StandBy

**What:** a charging iPhone on its side becomes a bedside or desk display:
a huge clock, or two widget stacks side by side, or photos. At night it turns
red.

**Praise:** reviewers and users call the widget view the point of it ("where
the real magic happens"), and the red night mode is singled out
([Gridfiti](https://gridfiti.com/ios-standby-mode-ideas/), [Griplux](https://www.griplux.com/pages/how-to-use-standby-mode)).
Some prefer the clock alone ([Cult of Mac](https://www.cultofmac.com/how-to/iphone-standby-mode)).

**Dislikes:** only two small widgets; a medium widget can't fill the screen
(Cult of Mac). Keep a display to a few items ([iOSAppLists](https://iosapplists.com/best-standby-mode-apps-iphone-2026/)).

**Hive:** the strongest fit for the fridge. A wall display left alone should
read like a clock across the room and still let someone tick a chore. Hive's
version, **Clock screen**, takes the ideas (clock plus two stacks, a red night
tint, chosen by the household) and fixes the complaint: on a 1920-wide screen
the stacks are big, and in portrait the clock sits above them.

### Live Activities

**What:** a running thing (a timer, a delivery) pinned live to the lock
screen or the island at the top.

**Praise:** people stop unlocking "just to check a number that was already
visible" ([Notewall](https://notewall.info/blog/live-activities-for-reminders-iphone), a blog);
timers with Pause and Cancel on the lock screen are the common example.

**Hive:** later. Hive's apps have no event feed yet (README roadmap step 4).
The home screen's top line does the cheap part now (see At a Glance).

### Spotlight

**What:** pull down anywhere to search apps and what's in them.

**Hive:** already built (apps, tasks, calendar, trips, shopping, meals,
chores). Kept as is.

### Edit mode ("jiggle mode")

**What:** press and hold to edit; icons shake; drag to rearrange, drop on
another icon to make a folder.

**Dislikes:** editing triggering by accident ("every time I touch the screen
the icons jiggle … inadvertently moving or removing an icon"), and layouts
scattering after a widget move ([Apple Community](https://discussions.apple.com/thread/254358795),
[Apple developer forums](https://developer.apple.com/forums/thread/656888?page=3), anecdotal).

**Hive:** keep the gesture (hold, drag, rest to make a folder), keep icons
still (the design doc rules out jiggle: on a wall display shaking text is
hard to read), and make the motion carry the meaning instead: the icon lifts
under the finger, neighbours slide out of the way, and it settles into place
when dropped.

## Apple: Apple TV (tvOS)

### Focus engine with lift and parallax

**What:** with a remote, the focused tile lifts, grows slightly and tilts
with the thumb.

**Praise:** "small animations, color changes and a parallax effect are used
to clearly indicate exactly which UI element is in focus"
([UX Planet](https://uxplanet.org/10-ux-design-tips-for-apple-tv-apps-305248dfd36));
"a feeling of depth that clearly identifies the item that's currently in
focus" ([Hyper, Medium](https://medium.com/hyperoslo/designing-for-tvos-vs-other-devices-with-interaction-in-mind-94037372cb7a)).
**Dislike:** parallax art is extra work and some icons "simply aren't
designed" for it ([Fast Company](https://www.fastcompany.com/3050952/four-fun-design-flourishes-in-apple-tvs-new-tvos)).

**Hive:** the lift, yes (keyboard focus on tiles grows and floats, on top of
the honey ring). The tilt, no: there's no remote thumb to follow, and it
would be motion for its own sake.

### Screensavers and profiles

**Praise:** the aerial screensavers are "one of the best features of the
product" ([MacStories, tvOS 12](https://www.macstories.net/reviews/tvos-12-the-macstories-review/)),
and choosing which ones play was "a level of customization I've always
wanted" ([9to5Mac](https://9to5mac.com/2025/09/19/apple-tv-4k-gets-the-screen-saver-feature-ive-always-wanted-in-tvos-26/)).
Profiles exist but apps are "shy" to use them ([AppleInsider](https://appleinsider.com/articles/25/09/14/tvos-26-review-high-on-polish-light-on-new-features-for-apple-tv)).

**Hive:** the screensaver lesson is "let people choose what plays", which is
how Clock screen works. Profiles: later, with Hive accounts on the fridge
(the layout already follows the device; following the person comes with
sign-in sync).

### Fluid, physical motion

**What:** Apple's own design talk: gestures should be responsive,
redirectable and interruptible; motion should carry the finger's momentum,
and the landing point should be projected from the flick
([WWDC18, Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/);
summary in [Nathan Gitter](https://medium.com/@nathangitter/building-fluid-interfaces-ios-swift-9732bb934bf5)).
Springs have no fixed duration and can be interrupted mid-flight.

**Hive:** yes, this is the "smooth" the owner asked for. Pages follow the
finger, a flick is projected to choose the page, and a critically damped
spring settles it (no bounce, per the design doc; a hard flick may overshoot
by a few pixels). Everything moves with transforms only.

## Android, Pixel and launchers

### Material You: colour from the wallpaper

**What:** the system picks a palette from the wallpaper and uses it for
widgets, the dock and controls.

**Praise:** "can look beautiful with the right wallpaper"
([Android Police](https://www.androidpolice.com/everything-i-hate-about-material-you/));
Pixel Launcher has "the most refined Material You implementation"
([One4Studio](https://www.one4studio.com/setups/material-you-dynamic)).
**Dislike:** fewer manual choices ("some users wanted to pick accent colors
manually", store reviews).

**Hive:** yes, as a choice: Hive's chrome (dock shelf, folders, page dots,
tinted icons) can take its colour from the wallpaper, including a photo.
Turning it off returns to Hive's own neutral tones.

### Themed icons

**Dislike:** "when the same color is applied to all icons, it makes it nearly
impossible to find your favorite apps" ([Android Police](https://www.androidpolice.com/themed-icons-look-terrible/)).

**Hive:** Hive's glyphs are all its own line drawings, so every icon supports
every style properly (the "not all apps support it" complaint can't happen).
Three styles: **Colour** (default), **Dark** (dark tile, glyph in the app's
own colour, so colour still finds the app), **Tinted** (wallpaper colour).

### At a Glance

**What:** a line at the top of the Pixel home screen with the date, the next
event, the weather.

**Praise:** a pill "tinted by Dynamic Color" that "can show the date,
upcoming events, a weather forecast, and much more" ([9to5Google](https://9to5google.com/2023/07/12/at-a-glance-widget-material-you-redesign/)).
**Dislike:** it can't be removed, and it often just repeats the weather
([MakeUseOf](https://www.makeuseof.com/your-pixel-home-screen-look-incredible-with-these-tricks/)).

**Hive:** yes, and it can be turned off. Hive's line says the one thing that
matters next (the next event today, dinner tonight, a trip leaving) and taps
through to the app.

### Resizable widgets, grids, icon packs, gestures (Nova, Niagara)

**Praise:** Nova for "granular control over grid, icon sizes, and even the
number of icons you can place on the dock" and its gestures
([Android Authority](https://www.androidauthority.com/nova-launcher-885296/));
Niagara for minimalism and one-handed reach, and a "Dots" style that reduces
each app to its colour ([Android Authority](https://www.androidauthority.com/niagara-launcher-vs-nova-launcher-3546669/)).

**Hive:** grid columns and icon size already exist; add **density**
(Comfortable / Compact rows). Widgets keep three sizes rather than free
resizing (three sizes reflow well across screens). Badges get a choice of
**count, dot, or off**, the dot being Android's notification dot.

### Predictive back

**What:** swiping back shows where you're going before you let go.
**Praise:** "an addition I've found useful almost daily" ([Tom's Guide](https://tomsguide.com/reviews/android-14)).

**Hive:** already there in spirit: swiping up on an app's home bar shrinks the
app with your finger. Kept.

## What people dislike most (and Hive avoids)

- **Glass and transparency over content.** iOS 26 Liquid Glass drew
  complaints that menus are "near impossible to read" and some users
  reported eye strain ([MacRumors](https://www.macrumors.com/2025/09/17/ios-26-liquid-glass-critiques/),
  [TechRadar](https://www.techradar.com/phones/ios/ios-26-users-say-liquid-glass-is-causing-eye-strain-and-vertigo-here-are-the-possible-fixes)).
  Hive stays opaque and flat (design doc principle 3).
- **One tint on everything** (see themed icons).
- **Edit mode by accident, layouts that scatter.** Hive keeps the hold time,
  moves only after a rest, and never moves an item more than one page.
- **Features you can't switch off** (App Library, At a Glance). Every Hive
  addition has an off switch.

## What this preview builds

| Feature | Phone | Tablet | Fridge |
| --- | --- | --- | --- |
| Smooth pages: follow the finger, flick projection, spring settle, wallpaper drift | ✓ | ✓ | ✓ |
| Neighbours slide aside while dragging, the icon settles into its slot on drop | ✓ | ✓ | ✓ |
| Widget stacks (drop a widget on another), swipe or tap the rail, household-aware rotation | ✓ | ✓ | ✓ |
| Clock screen (StandBy-like): clock plus two stacks, red night tint, burn-in shift, opens when left alone | | ✓ | ✓ |
| Colour from wallpaper; icon styles Colour, Dark, Tinted | ✓ | ✓ | ✓ |
| At a Glance line under the clock | ✓ | ✓ | ✓ |
| Page breaks (start a page anywhere) | ✓ | ✓ | ✓ |
| Badges: count, dot or off; row density | ✓ | ✓ | ✓ |
| Widget picker with live previews at each size | ✓ | ✓ | ✓ |
| Keyboard focus lift (tvOS) | | ✓ | ✓ |
| Clock in an open-zero face (Barlow, signage letters), not Atkinson's slashed zero | ✓ | ✓ | ✓ |

**Why this set:** it is the overlap of what reviewers praise most, what fits
three very different screens from one layout, and what Hive's data makes
better than on a phone (rotation by the household's day; a fridge clock
that can still tick chores).

**Not built, and why**

- **Free icon placement with gaps:** breaks when the grid reflows between 4
  and 8 columns. Page breaks give the control people want from it.
- **Hidden pages / Focus pages:** needs per-person or per-time profiles; it
  belongs with Hive accounts on the fridge, not before.
- **Live Activities:** needs apps to publish events (roadmap step 4).
- **Parallax tilt, jiggle:** motion without information; the design doc
  rules both out.
- **Free widget resizing:** three sizes pack cleanly on every screen;
  arbitrary sizes would leave holes on some.
- **Icon packs:** Hive draws its own icons, and Edit icon already changes any
  app's colour and symbol.

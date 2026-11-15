# Imagery, Icons, And Emoji

## Contents

- Sources, In Order
- Choosing An Image
- Generating An Image
- Rejecting A Generated Image
- Image Treatment
- Icons
- Emoji
- Imagery In Social Posts

## Sources, In Order

Generated work either leaves imagery out or fills the gap with whatever it can make on the spot. Decide where each image comes from before laying out around it, in this order:

1. The person's own assets: product photos, screenshots, team and place photos, brand illustration.
2. The product itself: real screens, real data, and real output, cropped to the part that matters.
3. An image model, when the environment offers one.
4. A photo library whose terms cover the use: the license for the medium and purpose, the attribution it asks for, and a model or property release where people, private places, or trademarks are recognizable.
5. Type alone, with no image.

Do not stand in a hand-drawn SVG or CSS picture of the subject, such as a person, a device, a dish, or a building, for an image you do not have. Keep a drawing only when it reads as the thing at a glance at its viewing size; one that does not costs more than no image. Geometry you can define exactly, such as a chart, a diagram, a pattern, or a shape from the brand, is not this.

When none of the first four is available and the work needs a picture to carry it, say so, name the image that would, and build the type-only version.

## Choosing An Image

Judge each candidate against these, and drop one that fails any:

- **One subject.** The viewer can say what the image shows in a second. A wide scene with many small things is texture, not a subject.
- **This product, not the category.** An image that would fit any competitor's page, such as a handshake, a team around a laptop, a city at night, or a glowing network, says nothing. Prefer the specific person, place, object, or screen.
- **Room for what goes on it.** When text or an interface sits over the image, it needs a calm area where that will go. Crop to make one, lay a band or a gradient behind the text, or choose another image.
- **Light and color that fit the palette.** An image whose dominant colors fight the accent pulls attention from it. Choose images that share a temperature with the palette, or let the image set the palette.
- **Resolution for the largest size it is shown at,** at twice that size for screens with high pixel density.

## Generating An Image

- Describe what a photographer would set up: the subject and what it is doing, the setting, the framing and lens (close-up, eye level, 50mm, overhead), the light (window light from the left, overcast, low sun), the color of the scene, and where the empty space should be for text.
- Name the real thing. "A ceramic bowl of ramen on a worn wooden counter, steam visible, shot from above" beats "delicious food".
- Leave out text. Image models garble lettering; set it as type on top.
- Leave out style intensifiers such as "cinematic", "epic", "ultra-detailed", "4k", "dramatic lighting", "hyperrealistic", and "trending". They pull every image toward the same generated look.
- Generate several candidates, choose against Choosing An Image, then crop. Generate a series in one session with one shared description of light, lens, and color, so the images read as one shoot.

## Rejecting A Generated Image

Reject and regenerate, or crop the flaw out, when you see:

- Wrong anatomy or objects: hands, teeth, eyes, text, logos, wheels, keyboards, or anything that should be regular and is not.
- The generated look: waxy or airbrushed skin, a teal-and-orange grade, rim light on every edge, haze and particles in the air, a symmetrical hero pose facing the camera, and a background more detailed than the subject.
- A subject that could belong to any product, as in Choosing An Image.
- Anything that misrepresents the product, a real place, or a real person. A generated image must not stand in for a real product photo, a real customer, or a real team.

Look at each one at full size and at the size it will be shown. Flaws hide in thumbnails and show on large screens.

## Image Treatment

- Give every image on a surface one treatment: the same crop shape, corner radius, and edge, and the same grade. Mixed treatments read as images collected from different places.
- Crop with intent: close on the subject, or wide with the subject placed on a third. A centered subject with even space around it reads as a default.
- Do not put a border, a shadow, and a radius on the same image. Choose one, or none.

## Icons

- **Use an established icon library,** such as the one the project already uses, or an open set such as Lucide, Phosphor, Tabler, or Material Symbols. Never draw icons ad hoc; hand-drawn icons differ in stroke, size, and metaphor and read as clip art.
- **One style per surface:** outline or filled, one stroke weight, and one corner style. Use the filled variant only for a state, such as a selected tab.
- **Match the text.** Choose the stroke weight to match the weight of the text beside it, size the icon to about the text's line height, and center it on the text's line.
- **Add an icon only where it speeds recognition:** navigation, repeated actions, status, and file or item types. A heading, a paragraph, or a list of benefits does not need one.
- **Choose a literal metaphor or none.** An icon must name the action or object it stands for: a trash can for delete, a bell for notifications. Skip the abstract clichés, such as a rocket for launch or growth, a lightbulb for ideas, a handshake for partnership, a shield for security, a lightning bolt for speed, and sparkles for AI. When no icon names the thing without its label, use the label.
- **Icons with their labels.** An icon alone is understood only for the few that everyone reads, such as search, close, and menu. Give the rest a visible label. Every icon-only control needs an accessible name, whichever icon it uses; a tooltip adds to the name and does not replace it.

## Emoji

Emoji are not icons. They carry a tone, and they look different on every platform: the same character can be detailed and warm on one system and crude on another. Never use them as bullets, as section icons, or as a substitute for an icon set.

They can be right when the tone is the point and the content is casual, personal, or playful, such as a social post, a short video, a friendly empty state, or a product whose voice already uses them. Then:

- **Use few, chosen for the art.** One or two, large enough to be seen as an image, chosen because that drawing fits. Judge the drawing as you would an illustration, not the character's meaning alone.
- **Fix the rendering where the output is an image or a video.** The capture bakes in the emoji font of the machine that renders it, which may be the crude one. Render the emoji as an image from an openly licensed set, such as Noto Color Emoji, Microsoft's Fluent Emoji, or Twemoji, and keep the set's license and any required attribution. Do not export Apple's emoji art into published graphics; it is Apple's copyrighted artwork, with no public license for reuse.
- **Accept the viewer's rendering in live text.** In a web page or an app, an emoji typed as text renders in each viewer's own system font. Use it there only where any rendering fits, or use an image from an open set at a fixed size, with alternative text that says what a meaningful emoji says, or empty alternative text for a decorative one.
- **Check the rendered result.** Look at the emoji in the render at its real size, and for live text, check it on at least two platforms when you can.
- **Do not mix sets** on one surface, or mix emoji with a line icon set in one role.

## Imagery In Social Posts

A post usually needs no icons at all. Its image is one large photo, product view, object, or emoji, or the type itself. A row of small icons beside short claims turns a post into a web page. When a post uses an emoji, it is the focal element or one accent beside the main line, rendered from an image set as above, never a decoration at the end of every line.

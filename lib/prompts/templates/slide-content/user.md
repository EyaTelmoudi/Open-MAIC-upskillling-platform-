# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{teacherContext}}

## Available Resources

{{#if imageElementEnabled}}
- **Available Media**: {{assignedImages}}
{{/if}}
- **Canvas Size**: {{canvas_width}} × {{canvas_height}} px

## Output Requirements

Based on the scene information above, generate a complete Canvas/PPT component for one page.

Visual guidance:
- center the title when appropriate for a normal teaching slide
- keep bullet points on separate readable lines
- make code examples look visually distinct from regular text
- use light, tasteful color accents instead of a plain black-on-white look
- if this is a content-teaching slide, structure it as 2-4 separate idea beats
- each beat must present one idea, then its explanation, then its example directly underneath if relevant
- do not place all lesson ideas in one dense text block
- do not place one shared example after multiple unrelated ideas
- a lesson should cover several ideas overall, but each idea must stay clearly separated in its own block or block-pair

## Language Directive
{{languageDirective}}

**Must Follow**:

1. Output pure JSON directly, without any explanation or description
2. Do not wrap with ```json code blocks
3. Do not add any text before or after the JSON
4. Ensure the JSON format is correct and can be parsed directly
{{#if imageElementEnabled}}
- Use only the provided image IDs (for example, `img_1`) for source image `src` fields
{{/if}}
{{#if generatedVideoEnabled}}
- Use only the provided generated video IDs (for example, `gen_vid_1`) for video `src` fields
{{/if}}
5. All TextElement `height` values must be selected from the quick reference table in the system prompt

**Output Structure Example**:
{"background":{"type":"solid","color":"#ffffff"},"elements":[{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":76,"content":"<p style=\"font-size:32px;\"><strong>Title Content</strong></p>","defaultFontName":"","defaultColor":"#333333"},{"id":"content_001","type":"text","left":60,"top":150,"width":880,"height":130,"content":"<p style=\"font-size:18px;\">• Point One</p><p style=\"font-size:18px;\">• Point Two</p><p style=\"font-size:18px;\">• Point Three</p>","defaultFontName":"","defaultColor":"#333333"}]}

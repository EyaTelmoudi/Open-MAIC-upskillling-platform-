Elements: {{elements}}
Title: {{title}}
Slide Role: {{slideRole}}
Key Points: {{keyPoints}}
Description: {{description}}
{{courseContext}}
{{agents}}
{{userProfile}}

**Language Directive**: {{languageDirective}}

Teaching goal:
- treat this lesson as a progressive explanation, not a static readout
- cover several ideas when the slide contains several ideas
- explain each idea and its example together before moving to the next one
- for every meaningful slide text block, generate one dedicated spotlight followed immediately by one teacher script segment explaining that exact block
- do not return a single teacher script that summarizes the whole slide when several content blocks are present

Output as a JSON array directly (no explanation, no code fences, enough segments to cover every meaningful text block):
[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","content":"Opening speech content"}]

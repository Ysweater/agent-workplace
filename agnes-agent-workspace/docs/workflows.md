# Workflow Registry

Agnes workflows are first-class definitions under `apps/server/src/workflows/`.

Each workflow declares:

```ts
{
  id,
  name,
  intent,
  steps,
  requiredTools,
  artifactTypes,
  resumePolicy,
  promptOptimizePolicy
}
```

## Registered Workflows

| Workflow | Intent | Steps | Artifacts | Prompt Optimization |
| --- | --- | --- | --- | --- |
| `chatWorkflow` | `chat` | `perceive -> compose_context -> answer -> persist` | text | Not required; context composition only. |
| `researchWorkflow` | `research` | `prompt_optimize -> web_search -> research_report -> html_preview -> summary` | markdown, html, text | Required; semantic decomposition and search intent. |
| `websiteWorkflow` | `website` | `prompt_optimize -> build_website -> preview -> summary` | html, json, text | Required; page structure, visual style, technical constraints. |
| `presentationWorkflow` | `presentation` | `prompt_optimize -> generate_slides -> deck_preview -> summary` | html, markdown, json, text | Required; audience, story arc, slide structure. |
| `mediaWorkflow` | `media` | `prompt_optimize -> generate_image_or_video -> media_artifact -> summary` | image, video, json, text | Required; subject, composition, camera, lighting, negative prompt. |
| `writingWorkflow` | `writing` | `prompt_optimize -> document_generator -> html_preview -> summary` | markdown, html, text | Required; audience, tone, structure, factual boundaries. |
| `analysisWorkflow` | `analysis` | `prompt_optimize -> document_generator -> html_preview -> summary` | markdown, html, text | Required; criteria, assumptions, risks, actions. |

## Resume Policy

All production workflows use:

```text
skipCompleted = true
retryFailed = true
pendingCanUseNewModel = true
```

This means a resumed run skips successful steps, retries failed or pending steps, and can continue with the current session model preference.

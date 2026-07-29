# Prompt Workflow Templates — With Workflow Calls

This folder contains sample prompts that **already have the workflow call (slash command) built in**.
When pasted into Antigravity, the agent will automatically load the correct skill and execute the process.

---

## Difference from the original prompt_template/

| | `prompt_template/` (original) | `prompt_workflow_template/` (this one) |
|---|---|---|
| Calls a workflow | No | Yes (first line) |
| Agent loads a skill | No (uses default context) | Yes (loads the correct skill from the workflow) |
| Best suited for | Quick use with any AI | Use with Antigravity/Gemini |

## List

| # | File | Workflow | Skill |
|---|------|----------|-------|
| 01 | `prompt_01_generate_requirements` | `/generate_requirements_from_website` | `requirements_analyzer` |
| 02 | `prompt_02_generate_test_cases` | `/generate_manual_testcases_rbt` | `rbt_manual_testing` |
| 03 | `prompt_03_create_framework_playwright` | `/generate_automation_framework` | `qa_automation_engineer` |
| 03 | `prompt_03_create_framework_selenium` | `/generate_automation_framework` | `qa_automation_engineer` |
| 04 | `prompt_04_generate_script_playwright` | `/generate_automation_from_testcases` | `qa_automation_engineer` |
| 04 | `prompt_04_generate_script_selenium` | `/generate_automation_from_testcases` | `qa_automation_engineer` |
| 05 | `prompt_05_convert_manual_to_automation` | `/generate_automation_from_testcases` | `qa_automation_engineer` |
| 07 | `prompt_07_generate_test_data` | `/generate_test_data` | `test_data_generator` |
| 08 | `prompt_08_analyze_flaky_tests` | `/analyze_flaky_tests` | `flaky_test_analyzer` |
| 09 | `prompt_09_generate_api_tests` | `/generate_api_tests_from_swagger` | `qa_automation_engineer` |

Note: prompt_06 (Review Code) has no dedicated workflow, so it is not included in this folder.

## How to use

1. Choose the appropriate prompt
2. Open the .txt file
3. Replace [...] with real data
4. Copy the entire content → paste into the Antigravity chat → send
5. The agent will call the workflow itself → load the skill → execute

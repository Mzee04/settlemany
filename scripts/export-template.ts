import { writeFileSync } from "node:fs";
import { toExtendedJson } from "@xo-cash/utils";
import { settlemanyTemplate, SETTLEMANY_TEMPLATE_IDENTIFIER } from "../src/xo/settlemanyTemplate.ts";
writeFileSync("settlemany-template.json", toExtendedJson(settlemanyTemplate));
console.log(SETTLEMANY_TEMPLATE_IDENTIFIER);

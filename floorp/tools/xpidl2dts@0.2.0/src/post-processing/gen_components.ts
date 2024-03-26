import path from "path";
import {
	AUTO_GENERATED_COMMENT,
	ObjMetadata,
	ServicesConst,
} from "../defines.js";
import * as fs from "fs/promises";

export async function writeComponents(
	filePath: string,
	objMetadata: ObjMetadata,
) {
	let imports = "";
	let exports = "";
	let type_exports = "";

	let local_classes = "";

	for (const [_, meta] of objMetadata.entries()) {
		let import_interface = "import type {";
		for (const _interface of meta.interface) {
			let inner = "";
			//_interface = _interface.replace(";", "");
			import_interface += `${_interface} as _${_interface},`;

			if (_interface in meta.constants)
				for (const [name_constant, value_constant] of Object.entries(
					meta.constants[_interface],
				)) {
					// if (value_constant.includes("|")) {
					//   function process_bit_or(value_constant: string): string {
					//     console.log(value_constant);
					//     return eval(
					//       value_constant
					//         .replaceAll(" ", "")
					//         .split("|")
					//         .map((v) => {
					//           const _tmp = meta.constants[_interface][v];
					//           if (_tmp.includes("|")) {
					//             return process_bit_or(_tmp);
					//           } else {
					//             return _tmp;
					//           }
					//         })
					//         .join("|"),
					//     );
					//   }
					//   inner += `readonly ${name_constant} = ${process_bit_or(
					//     value_constant,
					//   )};\n`;
					// } else {
					//TODO 危険かも
					let toEval = "";
					for (const [idx, elem] of Object.entries(
						meta.constants[_interface],
					)) {
						toEval += `const ${idx} = ${elem};`;
					}
					inner += `readonly ${name_constant} = ${eval(
						toEval + value_constant,
					)};\n`;
					//}
				}
			inner += `/**\n* @deprecated this property not available on runtime\n*/\nreadonly $name : "${_interface}";\n`;

			local_classes += `class ${_interface} implements hasLfoName {${inner}};\n`;

			//exports += `//@ts-ignore error because ts(2420)\nabstract class ${_interface} implements _${_interface} {${inner}}\n`;
			exports += `/**\n* @type {_${_interface}}\n*/\n${_interface} : lfoLocal.${_interface};\n`;
			type_exports += `${_interface} : _${_interface};\n`;
		}
		import_interface += `} from "./${path
			.relative(filePath.split("/").slice(0, -1).join("/"), meta.filePath)
			.replaceAll(/\\/g, "/")}"\n`;
		imports += import_interface;
	}

	const ServicesMap = new Map<string, string[]>();

	for (const [idlIntf, jsIntf] of Object.entries(ServicesConst)) {
		const tmp = ServicesMap.get(jsIntf);
		if (tmp) {
			tmp.push(idlIntf);
		} else {
			ServicesMap.set(jsIntf, [idlIntf]);
		}
	}

	let Services = "";
	for (const [jsIntf, idlIntf] of ServicesMap.entries()) {
		Services += `${jsIntf}: ${idlIntf
			.map((v) => {
				return `_${v}`;
			})
			.join("&")};\n`;
	}
	const src = `
${AUTO_GENERATED_COMMENT}
${imports}

export interface hasLfoName {
  $name: keyof Components_Interfaces,
}

export namespace lfoLocal {
${local_classes}
}


export interface Components_Interfaces extends _nsIXPCComponents_Interfaces {
${type_exports}
}

export interface lfoCi extends _nsIXPCComponents_Interfaces {
/**
 * @deprecated Only for extends nsIXPCComponents_Interfaces
 */
QueryInterface: (
  aIID: any, ///in
) => object;
${exports}
}

declare const Components_Utils: _nsIXPCComponents_Utils;

interface _lfoClass {
  createInstance: <I extends Components_Interfaces, V extends hasLfoName>(
    aClass: V, ///in
  ) => I[V["$name"]];

  getService: <I extends Components_Interfaces, V extends hasLfoName>(
    aClass: V, ///in
  ) => I[V["$name"]];
}

interface Components_Classes extends _nsIXPCComponents_Classes {
  [key: \`@\${string}\`]: _lfoClass;
  /**
   * @deprecated Only for extends nsIXPCComponents_Classes
   */
  QueryInterface: (
    aIID: any, ///in
  ) => object;
}

interface Components extends _nsIXPCComponents {
  /**
   * @deprecated Only for extends nsIXPCComponents
   */
  QueryInterface: (
    aIID: any, ///in
  ) => object;
  readonly interfaces: lfoCi;
  readonly utils: typeof Components_Utils;
  readonly classes: Components_Classes;
}


interface Services {
${Services}
}

declare global {
  const Components: Components;
  const Cc: Components_Classes;
  const Cu: typeof Components_Utils;
  const Ci: lfoCi;
	const Services: Services;
}
  `;
	fs.writeFile(filePath, src.trim());
}

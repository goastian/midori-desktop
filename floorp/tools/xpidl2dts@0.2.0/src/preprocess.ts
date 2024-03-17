/**
 * @param _src Source Code to process
 * @returns Processed String
 */
export function preprocess(src: string): string {
	let _src = src;
	//* REMOVE C++ Codes
	{
		_src = _src.replaceAll(/%{[\s\S]*?%}/g, "");
	}

	//* remove indent
	{
		_src = _src
			.split("\n")
			.map((v) => {
				return v.trim();
			})
			.join("\n");
	}

	{
		//* remove empty line
		_src = _src.replaceAll(/[\n]+/g, "\n");
	}

	{
		_src = _src.replaceAll("\n{", " {");
		_src = _src.replaceAll("]\n", "] ");
	}

	let buf = "";
	let index = 0;
	while (index < _src.length) {
		//console.log("START\n" + _src.slice(index) + "\nEND\n");
		//* MULTICOMMENT
		if (_src.startsWith("/*", index)) {
			const idx_end_multicomment = _src.indexOf("*/", index);
			// if (idx_end_multicomment === -1) {
			//   buf += _src.slice(index);
			//   break;
			// }
			buf += _src.slice(index, idx_end_multicomment + 2);
			index = idx_end_multicomment + 2;
			if (_src[index] === "\n") {
				index += 1;
			}
			buf += "\n";
			//console.log(_src.slice(index, idx_end_multicomment + 3));
		}
		//* SINGLECOMMENT
		else if (_src.startsWith("//", index)) {
			const idx_next_newline = _src.indexOf("\n", index);
			if (idx_next_newline === -1) {
				buf += _src.slice(index);
				break;
			}
			buf += _src.slice(index, idx_next_newline + 1);
			//console.log(_src.slice(index, idx_next_newline + 1));
			index = idx_next_newline + 1;
		}
		//* https://learn.microsoft.com/en-us/windows/win32/midl/cpp-quote
		else if (_src.startsWith("cpp_quote(", index)) {
			const idx_next_newline = _src.indexOf("\n", index);
			index = idx_next_newline + 1;
		}
		//* END of interface
		else if (_src.startsWith("};\n", index)) {
			buf += _src.slice(index, index + 3);
			index += 3;
		}
		//* #include
		else if (_src.startsWith("#include", index)) {
			const idx_newline = _src.indexOf("\n", index);
			buf += _src.slice(index, idx_newline + 1);
			index = idx_newline + 1;
		} else if (_src.startsWith("cenum", index)) {
			//console.log(`CENUM`);
			const idx_semicolon = _src.indexOf("};\n", index);
			const idx_end = idx_semicolon;
			//console.log(idx_end);
			if (idx_end === -1) {
				buf += _src.slice(index);
				break;
			}

			buf += `${_src
				.slice(index, idx_end + 3)
				.replaceAll(/\/\*.*?\*\//g, "")
				.replaceAll(/\/\/.*\n/g, "") //TODO: process comments in cenum
				.replaceAll(/[ ]+|\n/g, " ")
				.trim()}\n`;
			index = idx_end + 3;
		}
		//* NORMAL
		else {
			const idx_semicolon = _src.indexOf(";", index);
			const idx_open_square_bracket = _src.indexOf("{", index);

			let idx_end = -1;
			const arr_idx = [idx_semicolon, idx_open_square_bracket].sort((a, b) => {
				return a - b;
			});

			//console.log(`arr_index : ${arr_idx}`);

			idx_end = arr_idx[0] !== -1 ? arr_idx[0] : arr_idx[1];

			const idx_multicomment = _src.indexOf("/*", index);
			const idx_singlecomment = _src.indexOf("//", index);
			if (idx_multicomment < idx_end && idx_multicomment !== -1) {
				idx_end = idx_multicomment - 1;
			}
			if (idx_singlecomment < idx_end && idx_singlecomment !== -1) {
				idx_end = idx_singlecomment - 1;
			}

			//console.log(idx_end);

			if (idx_end === -1) {
				buf += _src.slice(index);
				break;
			}
			buf += `${_src
				.slice(index, idx_end + 1)
				.replaceAll(/[ \n]+/g, " ")
				.replace(" ;", ";")
				.trim()}\n`;
			index = idx_end + 1;
			if (_src[index] === "\n") index += 1;
		}
	}

	return buf;
}

//TODO
export function processCENUM(line: string): string {
	const tokens = line.split(" ");
	//0 is cenum keyword
	const name = tokens[1].replace(":", "");
	//2 is `:`
	const bytenum = tokens[3];
	const tokens_inner = tokens.slice(4).join("").replaceAll(/[{}]/g, "");

	let inner = "";
	let num = 0;
	for (const t of tokens_inner.split(",")) {
		if (t.replaceAll(/[;]|[\s]/g, "") !== "") {
			console.log(`t: ${t}`);
			if (t.includes("=")) {
				const _tmp = t.split("=");
				const elem_name = _tmp[0];
				const elem_num = _tmp[1];
				num = Number(elem_num);
				inner += `${elem_name}:${num};`;
			} else {
				inner += `${t.replaceAll(/[;\n]/g, "")}:${num};`;
			}
			num += 1;
		}
	}
	return `///CENUM ${bytenum}\n${name}:{${inner}}\n`;
}

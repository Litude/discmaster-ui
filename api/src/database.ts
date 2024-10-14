const DATABASE_DIR = 'database'

export const populateDatabase = async () => {
    const data = {}

    for await (const dirEntry of Deno.readDir(DATABASE_DIR)) {
        if (dirEntry.isFile && dirEntry.name.endsWith('.json')) {
            const fileData = JSON.parse(await Deno.readTextFile(`${DATABASE_DIR}/${dirEntry.name}`))
            Object.assign(data, fileData)
        }
    }

    return data
}

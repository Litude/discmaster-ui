import { serve } from "https://deno.land/std@0.185.0/http/server.ts";
import { JSDOM } from "https://dev.jspm.io/jsdom";
import { populateDatabase } from "./database.ts";

const knownHashes = await populateDatabase();

interface DiscmasterData {
  ext: string,
  family: string,
  filename: string,
  formatid: string,
  hash: string,
  href: string,
  itemid: number,
  size: number,
  ts: number,
  description?: string
}

interface GroupedData {
  filenames: Set<string>,
  family: string,
  formatid: string,
  hash: string,
  ext: string,
  size: number,
  firstDate: number,
  lastDate: number,
  entries: DiscmasterData[],
  description?: string
}

const parseResult = (entry: DiscmasterData) => {
  const pathParts = entry.href.split('/')
  let parent = decodeURIComponent(pathParts[pathParts.length - 2] || '');
  if (!parent.includes('.')) {
    parent = `${parent}/`
  }
  const description = knownHashes[entry.hash]
  return {
    ...entry,
    href: `https://discmaster.textfiles.com${entry.href}`,
    parent,
    description
  }
}

const groupResults = (rawData: DiscmasterData[]) => {
  const grouping: Record<string, GroupedData> = {}
  rawData.forEach(entry => {
    if (!grouping[entry.hash]) {
      grouping[entry.hash] = {
        filenames: new Set(),
        ext: entry.ext,
        family: entry.family,
        size: entry.size,
        hash: entry.hash,
        formatid: entry.formatid,
        firstDate: entry.ts,
        lastDate: entry.ts,
        entries: [parseResult(entry)],
        description: knownHashes[entry.hash]
      }
      grouping[entry.hash].filenames.add(entry.filename.toLowerCase())
    }
    else {
      const groupEntry = grouping[entry.hash]
      groupEntry.entries.push(parseResult(entry))
      groupEntry.filenames.add(entry.filename)
      if (groupEntry.firstDate > entry.ts) {
        groupEntry.firstDate = entry.ts
      }
      if (groupEntry.lastDate < entry.ts) {
        groupEntry.lastDate = entry.ts
      }
    }
  })

  const result = Object.values(grouping).map(entry => ({
    ...entry,
    filenames: [...entry.filenames]
  }))

  return result
}

const handleGroupedQuery = async (request: Request) => {
  const GROUPING_REQUEST_LIMIT = 250 // limited by discmaster

  const url = new URL(request.url);
  url.searchParams.set('limit', GROUPING_REQUEST_LIMIT.toString())
  url.searchParams.set('outputAs', 'json')
  let pageNumber = 0

  const totalResponse: DiscmasterData[] = []
  while (true) {
    if (pageNumber > 20) {
      console.log('Received more than 2500 results, result set is truncated')
      break
    }
    url.searchParams.set('pageNum', pageNumber.toString())
    const response = await fetch(`https://discmaster.textfiles.com/search?${url.searchParams}`, {
      headers: {
        accept: "application/json",
      },
    })
    const responseData = await response.json()
    if (!responseData.length) {
      break
    }
    totalResponse.push(...responseData)
    ++pageNumber
  }

  const groupedResults = groupResults(totalResponse)
  const sortOrder = url.searchParams.get('sortType')
  if (sortOrder) {
    if (sortOrder === 'ts') {
      groupedResults.sort((a, b) => b.firstDate - a.firstDate)
    }
    else if (sortOrder === 'size') {
      groupedResults.sort((a, b) => b.size - a.size)
    }
    else if (sortOrder === 'hash') {
      groupedResults.sort((a, b) => b.hash.localeCompare(a.hash))
    }
  }
  

  const responseBody = {
    data: groupedResults,
    count: groupedResults.length,
    type: "GROUPED"
  }
  
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
  });

}

const handleRegularQuery = async (request: Request) => {
  const url = new URL(request.url);

  const paramsCopy = new URLSearchParams(url.searchParams)

  url.searchParams.set('outputAs', 'json')
  const [resp, domResp] = await Promise.all([fetch(`https://discmaster.textfiles.com/search?${url.searchParams}`, {
    headers: {
      accept: "application/json",
    },
  }), fetch(`https://discmaster.textfiles.com/search?${paramsCopy}`)]);

  const [reponseData, htmlData]: [DiscmasterData[], string] = await Promise.all([resp.json(), domResp.text()]);
  const totalResults = parseTotalResults(htmlData)

  const transformedData = reponseData.map(parseResult)

  const responsePayload = {
    data: transformedData,
    count: totalResults,
    type: "SINGLE"
  }

  return new Response(JSON.stringify(responsePayload), {
    status: resp.status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
  });
}

const parseTotalResults = (htmlData: string) => {
  let totalCount: string = ""
  const htmlDom = new JSDOM(htmlData)
  const window = htmlDom.window
  const xPathResult = window.document.evaluate('/html/body/table/tbody/tr/td[2]/b/tt/font', window.document, null, 0)
  const element = xPathResult.iterateNext()
  const textContent = element?.textContent
  if (textContent) {
    totalCount = (textContent.match(/\d+ results shown \((\d+(,\d+)*) total matches\)/) || [])[1]
    if (totalCount) {
      totalCount = totalCount.replaceAll(",", "")
    }
    else {
      totalCount = (textContent.match(/(\d+) results/) || [])[1]
    }
    if (!totalCount) {
      return undefined
    }
    return +totalCount
  }
  return undefined
}


const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  const hashGrouping = !!url.searchParams.get('hashGrouping')
  if (hashGrouping) {
    url.searchParams.delete('hashGrouping')
    return handleGroupedQuery(request)
  }
  else {
    return handleRegularQuery(request)
  }

};

serve(handler);
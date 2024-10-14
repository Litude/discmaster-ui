import { Temporal } from '@js-temporal/polyfill';
import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import './App.css';

enum ResultType {
  None = "NONE",
  Single = "SINGLE",
  Grouped = "GROUPED"
}

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
  parent: string,
  description?: string
}

interface GroupedData {
  filenames: string[],
  family: string,
  formatid: string,
  hash: string,
  ext: string,
  size: number,
  firstDate: number,
  lastDate: number,
  description?: string,
  entries: DiscmasterData[]
}

function App() {

  const [singleData, setSingleData] = useState<DiscmasterData[] | null>(null)
  const [groupedData, setGroupedData] = useState<GroupedData[] | null>(null)
  const [searchInput, setSearchInput] = useState<string>('')
  const [dateFromInput, setDateFromInput] = useState<string>('');
  const [dateToInput, setDateToInput] = useState<string>('');
  const [useHashGrouping, setUseHashGrouping] = useState<boolean>(false)
  const [sortOrder, setSortOrder] = useState<string>('')
  const [searchLimit, setSearchLimit] = useState<string>('100')
  const [totalResults, setTotalResults] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState<number | null>(null)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [resultType, setResultType] = useState<ResultType>(ResultType.None)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const fetchData = async (query: string, pageNumber: number) => {
    const searchParams = new URLSearchParams()
    searchParams.set('q', query)
    searchParams.set('limit', searchLimit)
    const originalSearchLimit = +searchLimit || 100
    if (sortOrder) {
      searchParams.set('sortBy', sortOrder)
    }
    searchParams.set('pageNum', pageNumber.toString())
    if (useHashGrouping) {
      searchParams.set('hashGrouping', true.toString())
    }
    if (dateFromInput) {
      searchParams.set('tsMin', dateFromInput)
    }
    if (dateToInput) {
      searchParams.set('tsMax', dateToInput);
    }
    setLoading(true)
    const result = await fetch(`http://localhost:8000?${searchParams}`);
    if (result.ok) {
      const resultData = await result.json()
      setResultType(resultData.type)

      if (resultData.type === ResultType.Grouped) {
        setGroupedData(resultData.data)
      }
      else if (resultData.type === ResultType.Single) {
        setSingleData(resultData.data)
      }

      setTotalResults(resultData.count)
      setTotalPages(Math.ceil(resultData.count/originalSearchLimit))
      setLoading(false)
    }
  }

  const setSortType = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value
    if (!newValue) {
      setSortOrder('')
    }
    else {
      setSortOrder(newValue)
    }
  }

  const handleEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      performSearch()
    }
  }

  const performSearch = (pageNumber: number = 0) => {
    if (searchInput) {
      setCurrentPage(pageNumber)
      fetchData(searchInput, pageNumber)
    }
  }

  const renderSingleResultCompleteTable = (data: DiscmasterData[]) => {
    return (
      <>
      <div>{`${data.length} results shown (${totalResults} total matches)`}</div>
      {totalPages && totalPages > 1 && (
        <div style={{display: 'flex'}}>{
          Array.from(Array(totalPages).keys()).map((key) => {
            if (key === currentPage) {
              return <div>{key + 1}</div>
            }
            else {
              return <div className="page-number" onClick={() => {
                setCurrentPage(key)
                performSearch(key)
              }}>{key + 1}</div>
            }
          })
          }</div>
      )}
      {renderSingleResultTable(data)}
      </>
    )
  }

  const renderSingleResultTable = (data: DiscmasterData[]) => {
    return (
      <table style={{ width: '100%' }} cellSpacing={1} border={2}>
        <tbody>
          <tr>
            <th>Name</th>
            <th>Format</th>
            <th>Size</th>
            <th>Date</th>
            <th>Hash</th>
            <th>Parent</th>
            <th>Description</th>
          </tr>
          {data.map((entry, index) => {
            return (<tr key={index}>
              <td><a href={entry.href}>{entry.filename}</a></td>
              <td>{entry.family}</td>
              <td>{`${(entry.size).toLocaleString('fr')} bytes`}</td>
              <td>{Temporal.Instant.fromEpochMilliseconds(entry.ts).toString()}</td>
              <td>{entry.hash.substring(0, 8)}</td>
              <td>{entry.parent}</td>
              <td>{entry.description}</td>
            </tr>)
          })}
        </tbody>
      </table>
    )
  }

  const renderGroupedResultTable = (data: GroupedData[]) => {
    return (
      <table style={{ width: '100%' }} cellSpacing={1} border={2}>
        <tbody>
          <tr>
            <th></th>
            <th>Name</th>
            <th># Matches</th>
            <th>Format</th>
            <th>Size</th>
            <th>First Date</th>
            <th>Last Date</th>
            <th>Hash</th>
            <th>Description</th>
          </tr>
          {data.map((entry, index) => {
            const isExpanded = !!expanded[entry.hash]

            return (
            <>
            <tr key={index}>
              <td style={{ cursor: 'pointer' }} onClick={() => setExpanded({ ...expanded, [entry.hash]: !isExpanded })}><span style={{ color: 'rgb(0, 102, 204)'}}>{isExpanded ? '−' : '+'}</span></td>
              <td>{entry.filenames.join(', ')}</td>
              <td>{entry.entries.length}</td>
              <td>{entry.family}</td>
              <td>{`${(entry.size).toLocaleString('fr')} bytes`}</td>
              <td>{Temporal.Instant.fromEpochMilliseconds(entry.firstDate).toString()}</td>
              <td>{Temporal.Instant.fromEpochMilliseconds(entry.lastDate).toString()}</td>
              <td>{entry.hash.substring(0, 8)}</td>
              <td>{entry.description}</td>
            </tr>
            {expanded[entry.hash] && (<tr>
              <td></td>
              <td colSpan={8}>{renderSingleResultTable(entry.entries)}</td>
            </tr>)}
            </>)
          })}
        </tbody>
      </table>
    )
  }


  return (
    <div className="container">
      <div className="search">
        <label htmlFor="query">search for</label>
        <input type="text" name="query" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyUp={handleEnter}></input>

        <label htmlFor="sortOrder">sort by</label>
        <select name="sortOrder" value={sortOrder} onChange={setSortType}>
          <option value="" key="default">-</option>
          <option value="ts" key="ts">date</option>
          <option value="hash" key="hash">hash</option>
          <option value="size" key="size">size</option>
        </select>

        <label htmlFor="dateFrom">date from</label>
        <input type="text" name="dateFrom" placeholder="YYYYMMDD" value={dateFromInput} onChange={(event) => setDateFromInput(event.target.value)} onKeyUp={handleEnter}></input>

        <label htmlFor="dateTo">date from</label>
        <input type="text" name="dateTo" placeholder="YYYYMMDD" value={dateToInput} onChange={(event) => setDateToInput(event.target.value)} onKeyUp={handleEnter}></input>

        <label htmlFor="limit">limit to</label>
        <input disabled={useHashGrouping} type="text" name="limit" value={searchLimit} onChange={(event) => setSearchLimit(event.target.value)}></input>

        <label htmlFor="grouping">group by hash</label>
        <input type="checkbox" checked={useHashGrouping} onChange={(event) => setUseHashGrouping(event.target.checked)} />
        
        <button onClick={() => performSearch()}>Search!</button>
      </div>
      <div className="results">
        {
        loading ? 'Loading...'
        :
        resultType === ResultType.Single && singleData ? renderSingleResultCompleteTable(singleData)
        :
        resultType === ResultType.Grouped && groupedData ? renderGroupedResultTable(groupedData)
        :
        <span style={{fontWeight: 'bold', fontSize: '16px'}}>enter a search to the left</span>
        }
      </div>
    </div>
  );
}

export default App;

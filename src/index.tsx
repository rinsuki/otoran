process.env.TZ = "Asia/Tokyo"
import Koa from "koa"
import Router from "@koa/router"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import got from "got"
import { format } from "date-fns"
import $ from "transform-ts"

const app = new Koa()
const router = new Router()

const oneday = 24 * 60 * 60 * 1000

const Footer: React.FC<{}> = props => {
    return <>
        <hr />
        <footer>
            <div>Data from: <a href="https://site.nicovideo.jp/search-api-docs/snapshot">ニコニコ動画 『スナップショット検索API v2』</a></div>
            <div>GitHub: <a href="https://github.com/rinsuki/otoran">https://github.com/rinsuki/otoran</a></div>
            <div>Author: <a href="https://rinsuki.net">rinsuki</a></div>
            {props.children}
            <div>NEW! otoran 内で動画視聴/いいねができる <a href="https://addons.mozilla.org/ja/firefox/addon/otoran-inline-player/">Firefoxアドオン</a>を公開しました (2021/11/07)</div>
            <div><a href="/">トップに行く</a></div>
        </footer>
    </>
}

router.get("/", async ctx => {
    const currentTimestamp = await got("https://api.search.nicovideo.jp/api/v2/snapshot/version", {responseType: "json"}).then(r => r.body) as any
    const latestDay = new Date(currentTimestamp.last_modified).getTime() - oneday
    const latestPath = format(latestDay, "yyyy/MM/dd")
    ctx.body = renderToStaticMarkup(<html lang="ja">
        <head>
            <meta charSet="UTF-8"/>
            <title>otoran</title>
            <meta name="twitter:card" content="summary" />
            <meta property="og:title" content="otoran" />
            <meta property="og:description" content="ニコニコ動画のスナップショット検索APIを利用して、特定のタグ (現在は音MAD/VOCALOIDのみ) に投稿された動画一覧を投稿日ごとに分けて見ることができるサービスです。"/>
        </head>
        <body>
            <h1>otoran</h1>
            <p>ニコニコ動画の<a href="https://site.nicovideo.jp/search-api-docs/snapshot">スナップショット検索API</a>を利用して、特定のタグ<small>(現在は音MAD/VOCALOIDのみ)</small>に投稿された動画一覧を投稿日ごとに分けて見ることができます。</p>
            <p>スナップショット検索APIの仕様 (毎日日本時間の早朝にスナップショットを取り、その時の状態を検索する) 上、当日の日付での表示内容は不完全になるほか、各種数値等もその時のものになります。</p>
            <ul>
                <li><a href={`/daily/otomad/${latestPath}`}>{format(latestDay, "yyyy年M月d日")} (たぶん昨日) に投稿された音MAD</a></li>
                <li><a href={`/daily/vocaloid/${latestPath}`}>{format(latestDay, "yyyy年M月d日")} (たぶん昨日) に投稿されたVOCALOID</a></li>
            </ul>
            <Footer />
        </body>
    </html>)
    ctx.set("Cache-Control", "s-maxage=600")
})

function calcMajorTags(tags: string[]) {
    const tagCount = new Map<string, number>()
    for (const tag of tags) {
        if (tagCount.has(tag)) {
            tagCount.set(tag, tagCount.get(tag)!+1)
        } else {
            tagCount.set(tag, 1)
        }
    }
    return Array.from(tagCount.entries()).sort((b, a) => a[1]-b[1])
}

function normalizedTag(tag: string) {
    return encodeURIComponent(tag.toLowerCase().normalize("NFKC"))
}

function majorTagsNormalize(counts: [string, number][]) {
    const map = new Map<string, [string, number][]>()
    for (const count of counts) {
        const normalizedKey = normalizedTag(count[0])
        map.set(normalizedKey, [...map.get(normalizedKey) ?? [], count])
    }
    const arr = [] as [string, number][]
    for (const [_, entries] of map.entries()) {
        if (entries.length === 1) {
            arr.push(entries[0])
        } else {
            const entry = entries.sort((b, a) => a[1]-b[1])[0]
            entry[1] = entries.reduce((prev, now) => prev + now[1], 0)
            arr.push(entry)
        }
    }
    return arr
}

const words = new Map([
    ["otomad", "音MAD"],
    ["vocaloid", "VOCALOID"]
])

router.get("/daily/:word/:year/:month/:day", async (ctx, next) => {
    const {year, month, day, word} = ctx.params
    const tag = words.get(word)
    if (tag == null) return next()
    const d = new Date(year, month-1, day)
    const path = `/daily/${word}/${format(d, "yyyy/MM/dd")}`
    if (path !== ctx.path) {
        ctx.redirect(path)
        return
    }
    const target = new URL("https://api.search.nicovideo.jp/api/v2/snapshot/video/contents/search")
    target.searchParams.set("q", tag)
    target.searchParams.set("targets", "tagsExact")
    target.searchParams.set("_sort", "-likeCounter")
    target.searchParams.set("fields", "contentId,title,viewCounter,mylistCounter,commentCounter,tags,genre,thumbnailUrl,likeCounter")
    target.searchParams.set("filters[startTime][gte]", d.toISOString())
    target.searchParams.set("filters[startTime][lt]", new Date(d.getTime() + oneday).toISOString())
    target.searchParams.set("_limit", "100")
    console.log(target.href)
    const res = $.obj({
        meta: $.obj({
            totalCount: $.number,
        }),
        data: $.array($.obj({
            contentId: $.string,
            title: $.string,
            thumbnailUrl: $.string,
            tags: $.string,
            mylistCounter: $.number,
            commentCounter: $.number,
            viewCounter: $.number,
            likeCounter: $.number,
            genre: $.optional($.string),
        }))
    }).transformOrThrow(await got(target.href, {responseType: "json"}).then(r => r.body))
    const videos = res.data.sort((b, a) => {
        const mylistAndLike = (a.mylistCounter + a.likeCounter) - (b.mylistCounter + b.likeCounter)
        if (mylistAndLike !== 0) return mylistAndLike
        const comment = a.commentCounter - b.commentCounter
        if (comment !== 0) return comment
        return a.viewCounter - b.viewCounter
    })
    const majorTags = majorTagsNormalize(calcMajorTags(videos.map(video => video.tags.split(" ")).flat())).filter(([_, cnt]) => cnt > 1)
    ctx.body = renderToStaticMarkup(<html lang="ja">
        <head>
            <meta charSet="UTF-8" />
            <title>{format(d, "yyyy年M月d日")}に投稿された{tag} - otoran</title>
            <meta name="twitter:card" content="summary" />
            <meta property="og:title" content={`${format(d, "yyyy年M月d日")}に投稿された${tag} - otoran`} />
            <meta property="og:description" content={`${format(d, "yyyy年M月d日")}に投稿された${tag} (${res.meta.totalCount}件のうち${videos.length}件を表示中) をotoranでチェック！`}/>
            <style dangerouslySetInnerHTML={{__html: `body{margin:8px}*{word-break:break-all}#app{display:flex;margin:-8px}main{flex:1;margin:0 auto;padding:0 1em;width:calc(100vw - 15em);}.video{display:flex;margin:1em 0}.video-detail{flex:1;margin-left:1em}.prevnext>span{position:sticky;top:calc(50% - 1em)}.prevnext{padding:0 1em;text-align:center;text-decoration:none;}#prev{border-right:1px solid #eee}#next{border-left:1px solid #eee}.tags *{word-break:keep-all}kbd{color:#111;border:1px solid #ddd;border-radius:1px;padding:1px 4px;}.link{text-decoration:underline}#tags-filter>*{display:inline-flex;word-break:keep-all;align-items: baseline}.hidden{opacity:0;pointer-events:none;user-select:none}#tags-filter[data-has-filter="yes"]{position:sticky;top:0;background:rgba(255,255,255,0.95)}#tags-filter{margin:0 -1em 1em;padding:0.5em 1em;border-bottom:1px solid #eee}`}} />
        </head>
        <body>
            <div id="app">
                <a href={`/daily/${word}/${format(d.getTime() - oneday, "yyyy/MM/dd")}`} id="prev" className="prevnext"><span><span className="link">前の日</span><br /><kbd>A</kbd></span></a>
                <main>
                    <h1>{format(d, "yyyy年M月d日")}に投稿された{tag}</h1>
                    <p>全 <strong>{res.meta.totalCount}</strong> 件のうち <strong>{videos.length}</strong> 件を表示しています (表示はいいね+マイリス数(同数の場合はコメント数)順、取得はいいね数順)</p>
                    <div id="tags-filter" className="hidden">
                        絞り込み: {majorTags.map(([tag, count]) => <label key={tag}><input type="checkbox" value={normalizedTag(tag)}/>{tag}<small>({count})</small></label>)}
                    </div>
                    {videos.map(v => <div key={v.contentId} className="video" data-normalized-tags={` ${v.tags.split(" ").map(normalizedTag).join(" ")} `}>
                        <a className="thumbnail" href={`https://www.nicovideo.jp/watch/${v.contentId}`}><img src={v.thumbnailUrl} loading="lazy" width="130" height="100"/></a>
                        <div className="video-detail">
                            <div className="title"><a href={`https://www.nicovideo.jp/watch/${v.contentId}`} className="title">{v.title}</a></div>
                            <div className="stats"><span className="play-count">再生: <strong>{v.viewCounter}</strong></span> / <span className="comment-count">コメント: <strong>{v.commentCounter}</strong></span> / <span className="mylist-count">マイリスト: <strong>{v.mylistCounter}</strong></span> / <span className="like-count">いいね: <strong>{v.likeCounter}</strong></span></div>
                            <div className="tags">
                                {v.genre && <span class="tag-genre">ジャンル: {v.genre}{" "}</span>}
                                {v.tags.split(" ").map((tag: string) => <span key={tag}>🏷<a href={`https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}`}>{tag}</a>{" "}</span>)}
                            </div>
                        </div>
                    </div>)}
                </main>
                <a href={`/daily/${word}/${format(d.getTime() + oneday, "yyyy/MM/dd")}`} id="next" className="prevnext"><span><span className="link">次の日</span><br /><kbd>D</kbd></span></a>
            </div>
            <Footer>
                <div>ヒント: A/Dキーですばやく前/次の日に移動できます</div>
            </Footer>
            <script dangerouslySetInnerHTML={{__html: "(" + (() => {
                addEventListener("keypress", e => {
                    switch (e.key) {
                    case "a":
                        document.getElementById("prev")?.click()
                        break
                    case "d":
                        document.getElementById("next")?.click()
                        break
                    default:
                        console.log(e.key)
                        break
                    }
                })
                const tagsFilter = document.getElementById("tags-filter")!
                tagsFilter.classList.remove("hidden")
                const style = document.createElement("style")
                document.body.appendChild(style)
                let first = true
                function changeFilter() {
                    const tags = (Array.from(tagsFilter.querySelectorAll("input:checked")) as HTMLInputElement[])
                    const filter = tags.map(e => `[data-normalized-tags*=" ${e.value} "]`).join(",")
                    style.innerHTML = filter.length ? `.video:not(${filter}){display:none}` : ""
                    tagsFilter.dataset.hasFilter = filter.length > 0 ? "yes" : undefined
                    if (first) {
                        first = false
                    } else {
                        localStorage.setItem("otoran:tags-filter", tags.map(e => e.value).join(" "))
                    }
                }
                const tags = new Set<string>((localStorage.getItem("otoran:tags-filter") ?? "").split(" "))
                for (const checkbox of tagsFilter.querySelectorAll("input")) {
                    checkbox.checked = tags.has(checkbox.value)
                }
                changeFilter()
                tagsFilter.addEventListener("change", changeFilter)
            }).toString()+")()"}}/>
        </body>
    </html>)
    ctx.set("Cache-Control", "s-maxage=600") // 10分くらいCDNキャッシュしとく
})

app.use(router.routes())
app.listen(process.env.PORT || 3000)

process.env.TZ = "Asia/Tokyo"
import Koa from "koa"
import Router from "@koa/router"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import got from "got"
import { format } from "date-fns"

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
            <div><a href="/">トップに行く</a></div>
        </footer>
    </>
}

router.get("/", async ctx => {
    const currentTimestamp = await got("https://api.search.nicovideo.jp/api/v2/snapshot/version", {responseType: "json"}).then(r => r.body) as any
    const latestDay = new Date(currentTimestamp.last_modified).getTime() - oneday
    const latestPath = format(latestDay, "yyyy/MM/dd")
    ctx.body = renderToStaticMarkup(<html>
        <head>
            <meta charSet="UTF-8"/>
            <title>otoran</title>
            <meta name="twitter:card" content="summary" />
            <meta property="og:title" content="otoran" />
            <meta property="og:description" content="ニコニコ動画のスナップショット検索APIを利用して、特定のタグ (現在は音MADのみ) に投稿された動画一覧を投稿日ごとに分けて見ることができるサービスです。"/>
        </head>
        <body>
            <h1>otoran</h1>
            <p>ニコニコ動画の<a href="https://site.nicovideo.jp/search-api-docs/snapshot">スナップショット検索API</a>を利用して、特定のタグ<small>(現在は音MADのみ)</small>に投稿された動画一覧を投稿日ごとに分けて見ることができます。</p>
            <p>スナップショット検索APIの仕様 (毎日日本時間の早朝にスナップショットを取り、その時の状態を検索する) 上、当日の日付での表示内容は不完全になるほか、各種数値等もその時のものになります。</p>
            <ul>
                <li><a href={`/daily/otomad/${latestPath}`}>{format(latestDay, "yyyy年M月d日")} (たぶん昨日) に投稿された音MAD</a></li>
            </ul>
            <Footer />
        </body>
    </html>)
    ctx.set("Cache-Control", "s-maxage=600")
})

router.get("/daily/:word/:year/:month/:day", async (ctx, next) => {
    const {year, month, day, word} = ctx.params
    if (word !== "otomad") return next()
    const d = new Date(year, month-1, day)
    const path = `/daily/${word}/${format(d, "yyyy/MM/dd")}`
    if (path !== ctx.path) {
        ctx.redirect(path)
        return
    }
    const target = new URL("https://api.search.nicovideo.jp/api/v2/snapshot/video/contents/search")
    target.searchParams.set("q", "音MAD")
    target.searchParams.set("targets", "tagsExact")
    target.searchParams.set("_sort", "-mylistCounter")
    target.searchParams.set("fields", "contentId,title,description,viewCounter,mylistCounter,lengthSeconds,startTime,lastResBody,commentCounter,categoryTags,tags,genre,thumbnailUrl")
    target.searchParams.set("filters[startTime][gte]", d.toISOString())
    target.searchParams.set("filters[startTime][lt]", new Date(d.getTime() + oneday).toISOString())
    target.searchParams.set("_limit", "100")
    console.log(target.href)
    const res = await got(target.href, {responseType: "json"}).then(r => r.body) as any
    const videos = res.data.sort((b: any, a: any) => a.mylistCounter !== b.mylistCounter ? a.mylistCounter - b.mylistCounter : a.commentCounter !== b.commentCounter ? a.commentCounter - b.commentCounter : a.playCounter - b.playCounter)
    ctx.body = renderToStaticMarkup(<html>
        <head>
            <meta charSet="UTF-8" />
            <title>{format(d, "yyyy年M月d日")}に投稿された音MAD - otoran</title>
            <meta name="twitter:card" content="summary" />
            <meta property="og:title" content={`${format(d, "yyyy年M月d日")}に投稿された音MAD - otoran`} />
            <meta property="og:description" content={`${format(d, "yyyy年M月d日")}に投稿された音MAD (${res.meta.totalCount}件のうち${videos.length}件を表示中) をotoranでチェック！`}/>
            <style dangerouslySetInnerHTML={{__html: `*{word-break:break-all}#app{display:flex}main{flex:1}.video{display:flex;margin:1em 0}.video-detail{flex:1;margin-left:1em}`}} />
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
            }).toString()+")()"}} />
        </head>
        <body>
            <div id="app">
                <a href={`/daily/${word}/${format(d.getTime() - oneday, "yyyy/MM/dd")}`} id="prev">前の日</a>
                <main>
                    <h1>{format(d, "yyyy年M月d日")}に投稿された音MAD</h1>
                    <p>全 <strong>{res.meta.totalCount}</strong> 件のうち <strong>{videos.length}</strong> 件を表示しています (マイリスト数順、マイリストが同数の場合は…謎順 (表示はコメント数順))</p>
                    {videos.map((v: any) => <div key={v.contentId} className="video">
                        <a className="thumbnail" href={`https://www.nicovideo.jp/watch/${v.contentId}`}><img src={v.thumbnailUrl} loading="lazy" width="130" height="100"/></a>
                        <div className="video-detail">
                            <div className="title"><a href={`https://www.nicovideo.jp/watch/${v.contentId}`} className="title">{v.title}</a></div>
                            <div className="stats"><span className="play-count">再生: <strong>{v.viewCounter}</strong></span> / <span className="comment-count">コメント: <strong>{v.commentCounter}</strong></span> / <span className="mylist-count">マイリスト: <strong>{v.mylistCounter}</strong></span></div>
                            <div className="tags">{v.tags.split(" ").map((tag: string) => <span key={tag}>🏷<a href={`https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}`}>{tag}</a>{" "}</span>)}</div>
                        </div>
                    </div>)}
                </main>
                <a href={`/daily/${word}/${format(d.getTime() + oneday, "yyyy/MM/dd")}`} id="next">次の日</a>
            </div>
            <Footer>
                <div>ヒント: A/Dキーですばやく前/次の日に移動できます</div>
            </Footer>
        </body>
    </html>)
    ctx.set("Cache-Control", "s-maxage=600") // 10分くらいCDNキャッシュしとく
})

app.use(router.routes())
app.listen(process.env.PORT || 3000)

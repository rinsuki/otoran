import Koa from "koa"
import Router from "@koa/router"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import got from "got"
import { format } from "date-fns"

const app = new Koa()
const router = new Router()

const oneday = 24 * 60 * 60 * 1000

router.get("/daily/:word/:year/:month/:day", async (ctx, next) => {
    const {year, month, day, word} = ctx.params
    if (word !== "otomad") return next()
    const d = new Date(year, month-1, day)
    const path = `/daily/${word}/${format(d, "yyyy/MM/dd")}`
    if (path !== ctx.path) {
        ctx.redirect(path)
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
            <title>{format(d, "yyyy年M月d日")}に投稿された音MAD</title>
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
            <hr />
            <footer>
                <div>Data from: <a href="https://site.nicovideo.jp/search-api-docs/snapshot">ニコニコ動画 『スナップショット検索API v2』</a></div>
                <div>GitHub: <a href="https://github.com/rinsuki/otoran">https://github.com/rinsuki/otoran</a></div>
                <div>Author: <a href="https://rinsuki.net">rinsuki</a></div>
                <div>ヒント: A/Dキーですばやく前/次の日に移動できます</div>
            </footer>
        </body>
    </html>)
})

app.use(router.routes())
app.listen(process.env.PORT || 3000)

package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.widget.Toast;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** A's user-selected SAF destination, shared with B's isolated dictionary overlay. */
final class AudioSaveController {
    private static final int SAVE_AUDIO=2101;
    private final Activity activity;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private String selectedAudio,cookie,referer,agent;
    private volatile boolean destroyed;
    AudioSaveController(Activity activity){this.activity=activity;}
    void choose(String url,WebView web,String name,String mime){
        if(selectedAudio!=null){toast("请先完成当前音频保存");return;}
        if(url==null||!url.startsWith("https://")){toast("仅支持 HTTPS 音频");return;}
        selectedAudio=url;cookie=CookieManager.getInstance().getCookie(url);
        referer=web==null?null:web.getUrl();agent=web==null?"Jet Note":web.getSettings().getUserAgentString();
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);intent.putExtra(Intent.EXTRA_TITLE,name);
        try{activity.startActivityForResult(intent,SAVE_AUDIO);}catch(RuntimeException e){selectedAudio=null;toast("无法打开保存位置");}
    }
    boolean handles(int code){return code==SAVE_AUDIO;}
    void onActivityResult(int request,int result,Intent data){
        if(!handles(request))return;
        if(result!=Activity.RESULT_OK||data==null||data.getData()==null||selectedAudio==null){selectedAudio=null;return;}
        final String source=selectedAudio,requestCookie=cookie,requestReferer=referer,requestAgent=agent;
        final Uri target=data.getData();
        worker.execute(()->{
            HttpURLConnection connection=null;
            try{
                URL original=new URL(source),current=original;
                for(int redirects=0;redirects<=5;redirects++){
                    if(!current.getProtocol().equals("https"))throw new Exception("非 HTTPS 链接");
                    connection=(HttpURLConnection)current.openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setInstanceFollowRedirects(false);
                    connection.setRequestProperty("User-Agent",requestAgent);
                    if(requestReferer!=null)connection.setRequestProperty("Referer",requestReferer);
                    if(requestCookie!=null&&current.getHost().equals(original.getHost()))connection.setRequestProperty("Cookie",requestCookie);
                    int code=connection.getResponseCode();
                    if(code>=300&&code<400){String next=connection.getHeaderField("Location");connection.disconnect();if(next==null||redirects==5)throw new Exception("重定向失败");current=new URL(current,next);continue;}
                    if(code!=200)throw new Exception("HTTP "+code);break;
                }
                try(InputStream input=connection.getInputStream();OutputStream out=activity.getContentResolver().openOutputStream(target,"wt")){
                    if(out==null)throw new Exception("无法写入文件");byte[] buffer=new byte[65536];int n;
                    while((n=input.read(buffer))!=-1)out.write(buffer,0,n);out.flush();
                }
                toast("音频已保存，可在说说中添加");
            }catch(Exception e){toast("音频保存失败："+e.getMessage());}
            finally{if(connection!=null)connection.disconnect();activity.runOnUiThread(()->selectedAudio=null);}
        });
    }
    private void toast(String text){activity.runOnUiThread(()->{if(!destroyed)Toast.makeText(activity,text,Toast.LENGTH_LONG).show();});}
    void destroy(){destroyed=true;worker.shutdown();}
}

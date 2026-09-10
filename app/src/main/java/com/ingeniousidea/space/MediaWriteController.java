package com.ingeniousidea.space;

import android.content.Context;
import android.util.Base64;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Chunked one-time migration of A's existing IndexedDB Blobs; new picks stream from URI. */
final class MediaWriteController {
    private final Context context;
    private final AttachmentStore store;
    private final Map<String, Pending> pending = new HashMap<>();
    MediaWriteController(Context context, AttachmentStore store) { this.context=context; this.store=store; }
    synchronized String begin(String path) {
        try {
            File target=store.fileForArchivePath(path);
            if(target==null||pending.size()>=2)return "";
            String token=UUID.randomUUID().toString();
            File temp=File.createTempFile("media-write-",".tmp",context.getCacheDir());
            pending.put(token,new Pending(temp,target));return token;
        }catch(Exception e){return "";}
    }
    synchronized boolean append(String token,String encoded) {
        Pending p=pending.get(token);if(p==null||encoded==null||encoded.length()>200000)return false;
        try {p.out.write(Base64.decode(encoded,Base64.DEFAULT));return true;}
        catch(Exception e){cancel(token);return false;}
    }
    synchronized String finish(String token,String expected) {
        Pending p=pending.remove(token);
        try {
            if(p==null)throw new IOException("Media session expired");
            p.out.close();String hash=AttachmentStore.sha256(p.temp);
            if(expected!=null&&!expected.isEmpty()&&!expected.equalsIgnoreCase(hash))throw new IOException("Media checksum mismatch");
            if(p.target.exists()) {
                if(!hash.equals(AttachmentStore.sha256(p.target)))throw new IOException("Media path collision");
            } else if(!p.temp.renameTo(p.target)) {
                // Rename within app private storage should be atomic. Never expose partial media.
                throw new IOException("Cannot commit media file");
            }
            JSONObject result=new JSONObject();result.put("sha256",hash);result.put("size",p.target.length());return result.toString();
        }catch(Exception e){return error(e);}
        finally{if(p!=null){try{p.out.close();}catch(Exception ignored){}p.temp.delete();}}
    }
    synchronized void cancel(String token){Pending p=pending.remove(token);if(p!=null){try{p.out.close();}catch(Exception ignored){}p.temp.delete();}}
    synchronized void destroy(){for(String token:pending.keySet().toArray(new String[0]))cancel(token);}
    static String error(Exception e){JSONObject r=new JSONObject();try{r.put("error",e.getMessage()==null?"media-error":e.getMessage());}catch(Exception ignored){}return r.toString();}
    private static final class Pending {
        final File temp,target; final FileOutputStream out;
        Pending(File temp,File target)throws IOException{this.temp=temp;this.target=target;out=new FileOutputStream(temp);}
    }
}

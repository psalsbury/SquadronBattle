package uk.salsbury.squadronbattle;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The WebView scales text by the phone's font-size setting, but the game's boards and buttons don't grow
        // with it, so labels spill over each other. Keep text at the size the layout was designed for.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}

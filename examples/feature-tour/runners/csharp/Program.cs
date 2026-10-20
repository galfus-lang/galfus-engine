using System;
using Galfus;

namespace FeatureTourRunner
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("=== C# Runner: Galfus Engine Feature Tour ===");

            var galfus = new GalfusEngine();
            try { galfus.PlatformInitHeadless(); } catch {}

            const uint TARGET_ID = 1;
            const uint REALM_3D = 10;
            const uint REALM_2D = 20;

            galfus.MultiverseCreateTarget(TARGET_ID, "{\"kind\":{\"type\":\"texture\",\"width\":640,\"height\":480,\"format\":\"rgba8unorm\"},\"size\":[640,480]}");

            galfus.Realm3dCreate(REALM_3D);
            galfus.Realm2dCreate(REALM_2D);

            galfus.Realm3dCreateCamera(
                REALM_3D,
                1,
                "{\"fovY\":60.0,\"near\":0.1,\"far\":1000.0,\"cameraSlot\":0,\"lookAt\":{\"target\":[0.0,1.2,0.0],\"up\":[0.0,1.0,0.0]}}",
                "{\"position\":[0.0,2.5,7.0]}"
            );

            galfus.MultiverseCreateInvocation(
                100,
                "{\"realmId\":10,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":\"left\",\"anchorY\":\"top\",\"width\":{\"vw\":100},\"height\":{\"vh\":50}},\"clearColor\":[0.06,0.08,0.12,1.0]}"
            );

            galfus.MultiverseCreateInvocation(
                101,
                "{\"realmId\":20,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":\"left\",\"anchorY\":\"bottom\",\"width\":{\"vw\":100},\"height\":{\"vh\":50}},\"clearColor\":[0.02,0.03,0.05,1.0]}"
            );

            string posCmds = "[{\"type\":\"moveTo\",\"to\":[0.0,2.5,7.0]},{\"type\":\"lineTo\",\"to\":[16.0,2.5,7.0],\"duration\":4.0}]";
            string posCfg = "{\"duration\":36.0,\"loopMode\":\"loop\",\"valueType\":\"position3D\"}";
            galfus.AnimationCreatePathFollow(401, posCmds, posCfg);
            galfus.AnimationBindPathFollowTarget(401, "{\"kind\":\"camera3DTransform\",\"realmId\":10,\"cameraId\":1}");

            string lookCmds = "[{\"type\":\"moveTo\",\"to\":[0.0,1.2,0.0]},{\"type\":\"lineTo\",\"to\":[16.0,1.2,0.0],\"duration\":4.0}]";
            string lookCfg = "{\"duration\":36.0,\"loopMode\":\"loop\",\"valueType\":\"position3D\"}";
            galfus.AnimationCreatePathFollow(402, lookCmds, lookCfg);
            galfus.AnimationBindPathFollowTarget(402, "{\"kind\":\"camera3DLookAt\",\"realmId\":10,\"cameraId\":1}");

            for (ulong f = 0; f < 5; f++)
            {
                galfus.AnimationStep(0.016f);
                galfus.MultiverseResolve();
                galfus.MultiverseDispatch(f, 0.016f);
            }

            galfus.AnimationDestroyPathFollow(401);
            galfus.AnimationDestroyPathFollow(402);
            galfus.RealmDestroy(REALM_3D);
            galfus.RealmDestroy(REALM_2D);
            galfus.MultiverseDestroyTarget(TARGET_ID);
            galfus.PlatformShutdown();

            Console.WriteLine("✔ C# feature tour runner completed successfully!");
        }
    }
}

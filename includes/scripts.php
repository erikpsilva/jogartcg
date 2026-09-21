<script type="text/javascript" src="https://code.jquery.com/jquery-3.4.1.min.js"></script>
<script src="//cdnjs.cloudflare.com/ajax/libs/jquery.maskedinput/1.4.1/jquery.maskedinput.min.js"></script>

<?php
$version = time();
echo '
<script type="text/javascript" src="' . BASE_URL . '/scripts/plugins/slick.js?' . $version . '"></script>
<script type="text/javascript" src="' . BASE_URL . '/scripts/common.js?' . $version . '"></script>
';
?>
